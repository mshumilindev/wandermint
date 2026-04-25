import type { ActivityBlock } from "../../entities/activity/model";
import type { DayAdjustmentState, DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import type {
  CompletedTripSummary,
  TravelBehaviorPlanningBias,
  TravelBehaviorProfile,
  TravelBehaviorSelectedPace,
} from "./travelBehavior.types";

const ADJUSTMENT_DELAY_MINUTES: Record<DayAdjustmentState, number> = {
  as_planned: 0,
  early_finish: -18,
  late_start: 22,
  low_energy: 12,
  sick_day: 35,
  stay_in_day: 16,
  weather_reset: 18,
  travel_delay: 28,
};

const paceToScore = (pace: TravelBehaviorSelectedPace): number => {
  if (pace === "slow") {
    return 0;
  }
  if (pace === "balanced") {
    return 1;
  }
  return 2;
};

const scoreToPace = (score: number): TravelBehaviorSelectedPace => {
  if (score < 0.85) {
    return "slow";
  }
  if (score < 1.55) {
    return "balanced";
  }
  return "fast";
};

export const mapTripPreferencesPaceToSelectedPace = (pace: Trip["preferences"]["pace"]): TravelBehaviorSelectedPace => {
  if (pace === "slow") {
    return "slow";
  }
  if (pace === "dense") {
    return "fast";
  }
  return "balanced";
};

const isCountableBlock = (block: ActivityBlock): boolean => block.completionStatus !== "cancelled_by_replan";

const isCompletedBlock = (block: ActivityBlock): boolean =>
  block.completionStatus === "done" || block.completionStatus === "unconfirmed";

const isSkippedBlock = (block: ActivityBlock): boolean =>
  block.completionStatus === "skipped" || block.completionStatus === "missed";

const adjustmentDelayForDay = (day: DayPlan): number => {
  const state = day.adjustment?.state;
  if (!state) {
    return 0;
  }
  return ADJUSTMENT_DELAY_MINUTES[state];
};

/**
 * Builds a trip summary from saved day plans (aggregated block completion only — no raw locations or coordinates).
 */
export const buildCompletedTripSummaryFromDayPlans = (days: DayPlan[], trip: Trip): CompletedTripSummary => {
  const blocks = days.flatMap((day) => day.blocks).filter(isCountableBlock);
  const plannedItemsCount = blocks.length;
  const completedItemsCount = blocks.filter(isCompletedBlock).length;
  const skippedItemsCount = blocks.filter(isSkippedBlock).length;

  if (plannedItemsCount === 0) {
    return {
      plannedItemsCount: 0,
      completedItemsCount: 0,
      skippedItemsCount: 0,
      averageDelayMinutes: 0,
      selectedPace: mapTripPreferencesPaceToSelectedPace(trip.preferences.pace),
    };
  }

  const adjustmentLayer =
    days.length > 0 ? days.reduce((sum, day) => sum + adjustmentDelayForDay(day), 0) / days.length : 0;
  const skipPressure = (skippedItemsCount / plannedItemsCount) * 28;
  const averageDelayMinutes = Math.round(adjustmentLayer + skipPressure);

  return {
    plannedItemsCount,
    completedItemsCount,
    skippedItemsCount,
    averageDelayMinutes,
    selectedPace: mapTripPreferencesPaceToSelectedPace(trip.preferences.pace),
  };
};

const tripCompletionRate = (summary: CompletedTripSummary): number => summary.completedItemsCount / summary.plannedItemsCount;

const tripSkipRate = (summary: CompletedTripSummary): number => summary.skippedItemsCount / summary.plannedItemsCount;

const inferBehaviorPaceFromTrip = (summary: CompletedTripSummary): TravelBehaviorSelectedPace => {
  const completion = tripCompletionRate(summary);
  const skip = tripSkipRate(summary);
  if (skip > 0.3 || completion < 0.65) {
    return "slow";
  }
  if (completion > 0.9 && summary.averageDelayMinutes < 5) {
    return "fast";
  }
  return "balanced";
};

/** Exported for analytics dashboards that compare planned pace vs realized outcomes. */
export const inferBehaviorPaceFromTripSummary = (summary: CompletedTripSummary): TravelBehaviorSelectedPace =>
  inferBehaviorPaceFromTrip(summary);

const inferPlanningBiasFromAggregates = (profile: Omit<TravelBehaviorProfile, "lastUpdatedAt">): TravelBehaviorPlanningBias => {
  if (profile.averageSkipRate > 0.3) {
    return "overplanned";
  }
  if (profile.averageCompletionRate > 0.95 && profile.averageDelayMinutes < 0) {
    return "underplanned";
  }
  if (profile.averageCompletionRate > 0.9 && profile.averageDelayMinutes < 10) {
    return "realistic";
  }
  return "realistic";
};

const mergePreferredPace = (
  previous: TravelBehaviorProfile | null,
  summary: CompletedTripSummary,
  behaviorPace: TravelBehaviorSelectedPace,
  newTotalTrips: number,
): TravelBehaviorSelectedPace => {
  const selected = summary.selectedPace;
  if (newTotalTrips <= 1 || !previous) {
    const score = (2 * paceToScore(behaviorPace) + paceToScore(selected)) / 3;
    return scoreToPace(score);
  }

  const prevScore = paceToScore(previous.preferredPace);
  const weighted =
    (prevScore * (newTotalTrips - 1) + 2 * paceToScore(behaviorPace) + 1 * paceToScore(selected)) / (newTotalTrips + 2);
  return scoreToPace(weighted);
};

export const calculateTravelBehaviorProfile = (
  previousProfile: TravelBehaviorProfile | null,
  summary: CompletedTripSummary,
  userId: string,
): TravelBehaviorProfile | null => {
  if (summary.plannedItemsCount <= 0) {
    return null;
  }

  const prevTrips = previousProfile?.totalTrips ?? 0;
  const newTotalTrips = prevTrips + 1;

  const totalPlannedItems = (previousProfile?.totalPlannedItems ?? 0) + summary.plannedItemsCount;
  const totalCompletedItems = (previousProfile?.totalCompletedItems ?? 0) + summary.completedItemsCount;
  const totalSkippedItems = (previousProfile?.totalSkippedItems ?? 0) + summary.skippedItemsCount;

  const averageCompletionRate = totalPlannedItems > 0 ? totalCompletedItems / totalPlannedItems : 0;
  const averageSkipRate = totalPlannedItems > 0 ? totalSkippedItems / totalPlannedItems : 0;

  const prevDelay = previousProfile?.averageDelayMinutes ?? 0;
  const averageDelayMinutes =
    newTotalTrips > 0 ? Math.round((prevDelay * prevTrips + summary.averageDelayMinutes) / newTotalTrips) : summary.averageDelayMinutes;

  const behaviorPace = inferBehaviorPaceFromTrip(summary);
  const preferredPace = mergePreferredPace(previousProfile, summary, behaviorPace, newTotalTrips);

  const planningBias = inferPlanningBiasFromAggregates({
    userId,
    totalTrips: newTotalTrips,
    totalPlannedItems,
    totalCompletedItems,
    totalSkippedItems,
    averageCompletionRate,
    averageSkipRate,
    averageDelayMinutes,
    preferredPace,
    planningBias: "realistic",
  });

  return {
    userId,
    totalTrips: newTotalTrips,
    totalPlannedItems,
    totalCompletedItems,
    totalSkippedItems,
    averageCompletionRate,
    averageSkipRate,
    averageDelayMinutes,
    preferredPace,
    planningBias,
    lastUpdatedAt: new Date().toISOString(),
  };
};

type ScheduleDensity = NonNullable<Trip["executionProfile"]>["scheduleDensity"];
type ExplorationSpeed = NonNullable<Trip["executionProfile"]>["explorationSpeed"];

const scheduleDensityOrder: ScheduleDensity[] = ["relaxed", "balanced", "dense", "extreme"];

const bumpScheduleDensity = (current: ScheduleDensity, delta: -1 | 1): ScheduleDensity => {
  const index = scheduleDensityOrder.indexOf(current);
  const base = index === -1 ? 1 : index;
  const next = Math.min(scheduleDensityOrder.length - 1, Math.max(0, base + delta));
  return scheduleDensityOrder[next] ?? "balanced";
};

const bumpExplorationSpeed = (current: ExplorationSpeed, delta: -1 | 1): ExplorationSpeed => {
  const order: ExplorationSpeed[] = ["slow", "standard", "fast", "very_fast"];
  const index = order.indexOf(current);
  const base = index === -1 ? 1 : index;
  const next = Math.min(order.length - 1, Math.max(0, base + delta));
  return order[next] ?? "standard";
};

/**
 * Nudges generation draft execution profile from learned behavior (deterministic, no network).
 */
export const applyTravelBehaviorToTripDraft = (
  draft: { executionProfile: NonNullable<Trip["executionProfile"]> },
  profile: TravelBehaviorProfile,
): { executionProfile: NonNullable<Trip["executionProfile"]> } => {
  if (profile.totalTrips < 1) {
    return draft;
  }

  let executionProfile = { ...draft.executionProfile };

  if (profile.planningBias === "overplanned") {
    executionProfile = {
      ...executionProfile,
      scheduleDensity: bumpScheduleDensity(executionProfile.scheduleDensity, -1),
      explorationSpeed: bumpExplorationSpeed(executionProfile.explorationSpeed, -1),
    };
  } else if (profile.planningBias === "underplanned") {
    executionProfile = {
      ...executionProfile,
      scheduleDensity: bumpScheduleDensity(executionProfile.scheduleDensity, 1),
      explorationSpeed: bumpExplorationSpeed(executionProfile.explorationSpeed, 1),
    };
  }

  if (profile.preferredPace === "slow") {
    executionProfile = {
      ...executionProfile,
      explorationSpeed: bumpExplorationSpeed(executionProfile.explorationSpeed, -1),
      scheduleDensity: bumpScheduleDensity(executionProfile.scheduleDensity, -1),
    };
  } else if (profile.preferredPace === "fast") {
    executionProfile = {
      ...executionProfile,
      explorationSpeed: bumpExplorationSpeed(executionProfile.explorationSpeed, 1),
      scheduleDensity: bumpScheduleDensity(executionProfile.scheduleDensity, 1),
    };
  }

  return { executionProfile };
};
