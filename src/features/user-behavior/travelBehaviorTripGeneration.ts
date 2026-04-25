import type { ActivityBlock } from "../../entities/activity/model";
import type { Trip } from "../../entities/trip/model";
import { normalizeItineraryCategory } from "../../services/planning/itineraryCompositionService";
import type { TravelBehaviorProfile } from "./travelBehavior.types";

/** ~28% reduction (within 20–35% range), deterministic. */
const OVERPLANNED_KEEP_RATIO = 0.72;
const INTER_ITEM_BUFFER_EXTRA_MINUTES = 14;
const REALISTIC_MAX_BLOCKS_PER_DAY = 5;
const SLOW_MAJOR_ITEM_CAP = 4;
const FOOD_REST_EXTRA_MINUTES = 15;

export interface TravelBehaviorGenerationPlan {
  userOverridePacked: boolean;
  forceRealisticPacing: boolean;
  overplannedBias: boolean;
  slowPreferred: boolean;
  fastPreferred: boolean;
  showDensePlanWarning: boolean;
}

export const hasExplicitPackedItineraryOverride = (executionProfile: NonNullable<Trip["executionProfile"]>): boolean =>
  executionProfile.scheduleDensity === "extreme" || executionProfile.priorityMode === "maximum_density";

export const buildTravelBehaviorGenerationPlan = (
  profile: TravelBehaviorProfile | null | undefined,
  executionProfile: NonNullable<Trip["executionProfile"]>,
): TravelBehaviorGenerationPlan | null => {
  if (!profile || profile.totalTrips < 1) {
    return null;
  }

  const userOverridePacked = hasExplicitPackedItineraryOverride(executionProfile);
  const forceRealisticPacing = profile.averageSkipRate > 0.4 && !userOverridePacked;
  const overplannedBias = profile.planningBias === "overplanned";
  const slowPreferred = profile.preferredPace === "slow";
  const fastPreferred = profile.preferredPace === "fast";

  return {
    userOverridePacked,
    forceRealisticPacing,
    overplannedBias,
    slowPreferred,
    fastPreferred,
    showDensePlanWarning: overplannedBias,
  };
};

export const applyForceRealisticPacingToDraft = <T extends { executionProfile: NonNullable<Trip["executionProfile"]> }>(draft: T): T => {
  const ep = { ...draft.executionProfile };
  if (ep.scheduleDensity === "extreme" || ep.scheduleDensity === "dense") {
    ep.scheduleDensity = "balanced";
  }
  if (ep.explorationSpeed === "very_fast") {
    ep.explorationSpeed = "fast";
  }
  return { ...draft, executionProfile: ep };
};

/**
 * Single compact paragraph for the trip-generation model (rounded summaries only).
 */
export const buildCompactTravelBehaviorAiDirective = (
  profile: TravelBehaviorProfile | null | undefined,
  plan: TravelBehaviorGenerationPlan | null,
): string | null => {
  if (!profile || !plan || profile.totalTrips < 1) {
    return null;
  }

  const skipPct = Math.round(profile.averageSkipRate * 100);
  const delay = Math.round(profile.averageDelayMinutes);
  const parts: string[] = [];

  if (plan.forceRealisticPacing && plan.overplannedBias) {
    parts.push(
      `The user often overplans: average skip rate about ${skipPct}%, average timing drift about ${delay} minutes vs plan. Generate a less dense plan with stronger prioritization, fewer but higher-value locations per day, and more buffer between items. Do not propose extremely packed days.`,
    );
  } else if (plan.forceRealisticPacing) {
    parts.push(
      `Past trips show frequent skipped stops (about ${skipPct}% of planned items). Use realistic pacing and avoid extremely packed days unless the user has explicitly chosen maximum-density scheduling.`,
    );
  } else if (plan.overplannedBias) {
    parts.push(
      `The user often overplans: average skip rate about ${skipPct}%, average timing drift about ${delay} minutes vs plan. Generate a less dense plan with stronger prioritization, fewer but higher-value locations per day, and more buffer between items.`,
    );
  } else if (profile.planningBias === "underplanned") {
    parts.push(
      "The user tends to finish ahead of the written schedule; you may add grounded depth when it does not create unnecessary rush.",
    );
  }

  if (plan.slowPreferred) {
    parts.push(
      "Keep at most four major sights or deep activities per day where possible, and leave longer gaps around meals and rest.",
    );
  } else if (plan.fastPreferred) {
    parts.push(
      "The user often sustains a brisk pace when plans stay feasible; slightly denser days are acceptable if transfers and opening hours still work.",
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
};

const wallMinutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const formatWallMinutes = (total: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const shiftBlockTimes = (block: ActivityBlock, deltaMinutes: number): ActivityBlock => {
  const start = wallMinutes(block.startTime);
  const end = wallMinutes(block.endTime);
  if (start === null || end === null) {
    return block;
  }
  return {
    ...block,
    startTime: formatWallMinutes(start + deltaMinutes),
    endTime: formatWallMinutes(end + deltaMinutes),
  };
};

const sortBlocksByStart = (blocks: ActivityBlock[]): ActivityBlock[] =>
  [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));

const removalSortKey = (block: ActivityBlock): number => {
  if (block.locked || block.type === "transfer") {
    return 1_000;
  }
  if (block.priority === "must") {
    return 300;
  }
  if (block.priority === "should") {
    return 200;
  }
  return 100;
};

const trimToMaxBlocks = (blocks: ActivityBlock[], maxCount: number): ActivityBlock[] => {
  let working = sortBlocksByStart(blocks);
  while (working.length > maxCount) {
    const candidates = working.filter((b) => removalSortKey(b) < 500);
    if (candidates.length === 0) {
      break;
    }
    const victim = candidates.sort((a, b) => removalSortKey(a) - removalSortKey(b))[0];
    if (!victim) {
      break;
    }
    working = working.filter((b) => b.id !== victim.id);
  }
  return sortBlocksByStart(working);
};

const isMajorBlock = (block: ActivityBlock): boolean => {
  const cat = normalizeItineraryCategory(block);
  if (cat === "museum" || cat === "gallery" || cat === "landmark" || cat === "event") {
    return true;
  }
  return cat === "other" && block.type === "activity";
};

const isFoodRestBlock = (block: ActivityBlock): boolean => {
  const cat = normalizeItineraryCategory(block);
  return cat === "food" || cat === "cafe" || cat === "drink" || block.type === "rest";
};

const capMajorItems = (blocks: ActivityBlock[], maxMajor: number): ActivityBlock[] => {
  let working = sortBlocksByStart(blocks);
  let majors = working.filter(isMajorBlock);
  while (majors.length > maxMajor) {
    const removable = majors.filter((b) => removalSortKey(b) < 500);
    if (removable.length === 0) {
      break;
    }
    const victim = removable.sort((a, b) => removalSortKey(a) - removalSortKey(b))[0];
    if (!victim) {
      break;
    }
    working = working.filter((b) => b.id !== victim.id);
    majors = working.filter(isMajorBlock);
  }
  return sortBlocksByStart(working);
};

const extendFoodAndRest = (blocks: ActivityBlock[]): ActivityBlock[] =>
  blocks.map((block) => {
    if (!isFoodRestBlock(block)) {
      return block;
    }
    const end = wallMinutes(block.endTime);
    if (end === null) {
      return block;
    }
    return { ...block, endTime: formatWallMinutes(end + FOOD_REST_EXTRA_MINUTES) };
  });

const addInterItemBuffers = (blocks: ActivityBlock[]): ActivityBlock[] => {
  const ordered = sortBlocksByStart(blocks);
  const shifts: number[] = ordered.map(() => 0);
  let accumulated = 0;
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const current = ordered[i];
    const next = ordered[i + 1];
    if (!current || !next) {
      continue;
    }
    if (current.type === "transfer" && next.type === "transfer") {
      continue;
    }
    accumulated += INTER_ITEM_BUFFER_EXTRA_MINUTES;
    for (let j = i + 1; j < ordered.length; j += 1) {
      shifts[j] = accumulated;
    }
  }
  return sortBlocksByStart(ordered.map((block, index) => shiftBlockTimes(block, shifts[index] ?? 0)));
};

const overplannedKeepRatio = (plan: TravelBehaviorGenerationPlan): number => {
  if (plan.fastPreferred) {
    return 0.85;
  }
  if (plan.slowPreferred) {
    return 0.68;
  }
  return OVERPLANNED_KEEP_RATIO;
};

export const postProcessDayBlocksForTravelBehavior = (
  blocks: ActivityBlock[],
  plan: TravelBehaviorGenerationPlan,
): ActivityBlock[] => {
  let next = sortBlocksByStart(blocks);

  if (plan.forceRealisticPacing && !plan.userOverridePacked) {
    next = trimToMaxBlocks(next, REALISTIC_MAX_BLOCKS_PER_DAY);
  }

  if (plan.overplannedBias) {
    const ratio = overplannedKeepRatio(plan);
    const target = Math.max(3, Math.ceil(next.length * ratio));
    next = trimToMaxBlocks(next, target);
    next = addInterItemBuffers(next);
  }

  if (plan.slowPreferred) {
    next = capMajorItems(next, SLOW_MAJOR_ITEM_CAP);
    next = extendFoodAndRest(next);
  }

  return sortBlocksByStart(next);
};

export const buildTravelBehaviorUiHintKeys = (plan: TravelBehaviorGenerationPlan | null): string[] => {
  if (!plan?.showDensePlanWarning) {
    return [];
  }
  return ["densePlanFromPastTrips"];
};
