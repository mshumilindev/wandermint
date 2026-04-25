import type { ActivityBlock } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { ActivityOverlayEntry, TripPlanOverlay } from "../visited/planOverlayModel";
import { computePlanPacingState, detectFastCompletionPattern } from "./planPacingEngine";
import { getVisitSuggestion, type VisitSuggestion } from "../visited/planVisitSuggestion";
import { hasRealLocation, isEffectivelySkipped, isEffectivelyVisited } from "../visited/planVisitOverlayHelpers";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";
import { planLocalDateTime } from "./planTimeUtils";

dayjs.extend(utc);
dayjs.extend(tz);

export const SUGGESTION_COOLDOWN_MS = 30 * 60 * 1000;

export type UnifiedSuggestionKind = "visit_prompt" | "skip_prompt" | "insert_prompt" | "rest_prompt";

export type UnifiedPlanSuggestion =
  | (VisitSuggestion & { kind: "visit_prompt" })
  | {
      kind: "skip_prompt";
      activityKey: string;
      block: ActivityBlock;
      message: string;
      score: number;
    }
  | {
      kind: "insert_prompt";
      afterActivityKey: string;
      title: string;
      category: string;
      durationMinutes: number;
      message: string;
    }
  | {
      kind: "rest_prompt";
      variant: "park" | "cafe";
      message: string;
    };

export const suggestionFingerprint = (kind: UnifiedSuggestionKind, key: string): string => `${kind}::${key}`;

export const cooldownKeyFor = (kind: UnifiedSuggestionKind, activityKey?: string): string =>
  kind === "visit_prompt" && activityKey ? `visit_prompt::${activityKey}` : kind;

export const isSuggestionInCooldown = (overlay: TripPlanOverlay, key: string, now: Date): boolean => {
  const until = overlay.cooldownUntil[key];
  return typeof until === "number" && until > now.getTime();
};

export const isSuggestionDismissed = (overlay: TripPlanOverlay, fingerprint: string): boolean => Boolean(overlay.dismissed[fingerprint]);

const categoryWeight = (block: ActivityBlock): number => {
  const cat = block.category.toLowerCase();
  if (cat.includes("cafe") || cat.includes("coffee")) {
    return 2;
  }
  if (cat.includes("park") || cat.includes("view")) {
    return 1.5;
  }
  return 1;
};

const durationMinutesBlock = (block: ActivityBlock): number => {
  const [sh = 0, sm = 0] = block.startTime.split(":").map(Number);
  const [eh = 0, em = 0] = block.endTime.split(":").map(Number);
  return Math.max(10, eh * 60 + em - (sh * 60 + sm));
};

const isAnchorBlock = (block: ActivityBlock): boolean => block.locked || block.priority === "must";

export const scoreSkipCandidate = (
  block: ActivityBlock,
  categoryHistogram: Record<string, number>,
): { score: number; redundancyWeight: number } => {
  const lowPriorityWeight = block.priority === "optional" ? 3 : block.priority === "should" ? 1.5 : 0;
  const dur = durationMinutesBlock(block);
  const shortDurationWeight = dur <= 35 ? 2 : dur <= 50 ? 1 : 0;
  const catKey = block.category.toLowerCase();
  const redundancyWeight = (categoryHistogram[catKey] ?? 1) - 1;
  const routeBreakPenalty = block.type === "transfer" ? 4 : 0;
  const score = lowPriorityWeight + shortDurationWeight + redundancyWeight - routeBreakPenalty;
  return { score, redundancyWeight };
};

export const getSkipCandidates = (
  day: DayPlan,
  orderedBlocks: ActivityBlock[],
  overlayByKey: Record<string, ActivityOverlayEntry | undefined>,
  activityKey: (dayIndex: number, blockIndex: number, block: ActivityBlock) => string,
  dayIndex: number,
): { activityKey: string; block: ActivityBlock; score: number } | null => {
  const histogram: Record<string, number> = {};
  orderedBlocks.forEach((block) => {
    const key = block.category.toLowerCase();
    histogram[key] = (histogram[key] ?? 0) + 1;
  });

  const candidates: { activityKey: string; block: ActivityBlock; score: number }[] = [];

  orderedBlocks.forEach((block, blockIndex) => {
    if (blockIndex === 0 || blockIndex === orderedBlocks.length - 1) {
      return;
    }
    const key = activityKey(dayIndex, blockIndex, block);
    const overlay = overlayByKey[key];
    if (isEffectivelyVisited(block, overlay) || isEffectivelySkipped(block, overlay)) {
      return;
    }
    if (!hasRealLocation(block)) {
      return;
    }
    if (isAnchorBlock(block)) {
      return;
    }
    const { score } = scoreSkipCandidate(block, histogram);
    if (score < 1) {
      return;
    }
    candidates.push({ activityKey: key, block, score });
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
};

const haversineKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const insertionForwardOk = (
  current: ActivityBlock,
  next: ActivityBlock,
  candidateCoord: { latitude: number; longitude: number },
): boolean => {
  const cur = current.place;
  const nxt = next.place;
  if (
    cur?.latitude == null ||
    cur?.longitude == null ||
    nxt?.latitude == null ||
    nxt?.longitude == null
  ) {
    return true;
  }
  const dCurrent = haversineKm({ latitude: cur.latitude, longitude: cur.longitude }, candidateCoord);
  const dNext = haversineKm({ latitude: nxt.latitude, longitude: nxt.longitude }, candidateCoord);
  return dNext < dCurrent;
};

export const getInsertionStub = (
  day: DayPlan,
  orderedBlocks: ActivityBlock[],
  now: Date,
  timeZone: string,
  currentIndex: number,
): { title: string; category: string; durationMinutes: number; message: string } | null => {
  const nextIndex = currentIndex + 1;
  const current = orderedBlocks[currentIndex];
  const next = orderedBlocks[nextIndex];
  if (!current || !next || !hasRealLocation(current) || !hasRealLocation(next)) {
    return null;
  }

  const nowInTz = dayjs(now).tz(timeZone);
  const nextStart = planLocalDateTime(day.date, next.startTime, timeZone);
  const gapMinutes = nextStart.diff(nowInTz, "minute") - 15;
  if (gapMinutes < 20) {
    return null;
  }

  const midLat = ((current.place?.latitude ?? 0) + (next.place?.latitude ?? 0)) / 2;
  const midLon = ((current.place?.longitude ?? 0) + (next.place?.longitude ?? 0)) / 2;

  if (!insertionForwardOk(current, next, { latitude: midLat, longitude: midLon })) {
    return null;
  }

  const duration = Math.min(40, Math.max(25, Math.floor(gapMinutes * 0.45)));
  const templates = [
    { title: "Coffee pause", category: "cafe", durationMinutes: Math.min(30, duration) },
    { title: "Short park breather", category: "park", durationMinutes: Math.min(35, duration) },
    { title: "Viewpoint photo stop", category: "viewpoint", durationMinutes: Math.min(25, duration) },
  ];
  const pick = templates[Math.abs(hashSeed(current.id + next.id)) % templates.length] as (typeof templates)[number];

  return {
    title: pick.title,
    category: pick.category,
    durationMinutes: pick.durationMinutes,
    message: `You're ahead. Add ${pick.title.toLowerCase()} on the way?`,
  };
};

const hashSeed = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
};

export const getRestSuggestion = (goodWeather: boolean): { variant: "park" | "cafe"; message: string } => {
  if (goodWeather) {
    return { variant: "park", message: "Moving fast. Take a break in a nearby park?" };
  }
  return { variant: "cafe", message: "Slow down with a coffee stop?" };
};

export const findCurrentBlockIndex = (day: DayPlan, orderedBlocks: ActivityBlock[], now: Date, timeZone: string): number => {
  const nowMs = now.getTime();
  let idx = 0;
  orderedBlocks.forEach((block, i) => {
    const end = planLocalDateTime(day.date, block.endTime, timeZone).valueOf();
    if (end <= nowMs) {
      idx = i;
    }
  });
  return idx;
};

export interface UnifiedSuggestionInput {
  tripId: string;
  day: DayPlan;
  dayIndex: number;
  orderedBlocks: ActivityBlock[];
  overlay: TripPlanOverlay;
  overlayByKey: Record<string, ActivityOverlayEntry | undefined>;
  activityKey: (dayIndex: number, blockIndex: number, block: ActivityBlock) => string;
  now: Date;
  timeZone: string;
  goodWeather?: boolean;
}

export const getUnifiedPlanSuggestion = (input: UnifiedSuggestionInput): UnifiedPlanSuggestion | null => {
  const pacing = computePlanPacingState({
    day: input.day,
    dayIndex: input.dayIndex,
    orderedBlocks: input.orderedBlocks,
    overlayByKey: input.overlayByKey,
    activityKey: input.activityKey,
    now: input.now,
    timeZone: input.timeZone,
  });

  const visit = getVisitSuggestion(
    input.day,
    input.orderedBlocks,
    input.overlayByKey,
    input.activityKey,
    input.dayIndex,
    input.now,
    input.timeZone,
  );

  const tryVisit = (): UnifiedPlanSuggestion | null => {
    if (!visit) {
      return null;
    }
    const fp = suggestionFingerprint("visit_prompt", visit.activityKey);
    const cdKey = cooldownKeyFor("visit_prompt", visit.activityKey);
    if (isSuggestionDismissed(input.overlay, fp) || isSuggestionInCooldown(input.overlay, cdKey, input.now)) {
      return null;
    }
    return { ...visit, kind: "visit_prompt" as const };
  };

  const visitPick = tryVisit();
  if (visitPick) {
    return visitPick;
  }

  if (pacing === "behind") {
    const skip = getSkipCandidates(input.day, input.orderedBlocks, input.overlayByKey, input.activityKey, input.dayIndex);
    if (skip) {
      const fp = suggestionFingerprint("skip_prompt", skip.activityKey);
      if (!isSuggestionDismissed(input.overlay, fp) && !isSuggestionInCooldown(input.overlay, cooldownKeyFor("skip_prompt"), input.now)) {
        const msg = `You're running behind. Skip ${skip.block.title} to stay on track?`;
        return { kind: "skip_prompt", activityKey: skip.activityKey, block: skip.block, message: msg, score: skip.score };
      }
    }
  }

  if (pacing === "ahead") {
    const fast = detectFastCompletionPattern(
      input.day,
      input.orderedBlocks,
      input.overlayByKey,
      input.activityKey,
      input.dayIndex,
      input.now,
      input.timeZone,
    );
    if (fast.tooFast) {
      const rest = getRestSuggestion(Boolean(input.goodWeather));
      const fp = suggestionFingerprint("rest_prompt", rest.variant);
      if (!isSuggestionDismissed(input.overlay, fp) && !isSuggestionInCooldown(input.overlay, cooldownKeyFor("rest_prompt"), input.now)) {
        return { kind: "rest_prompt", ...rest };
      }
    }

    const curIdx = findCurrentBlockIndex(input.day, input.orderedBlocks, input.now, input.timeZone);
    const insert = getInsertionStub(input.day, input.orderedBlocks, input.now, input.timeZone, curIdx);
    if (insert) {
      const current = input.orderedBlocks[curIdx];
      const key = current ? input.activityKey(input.dayIndex, curIdx, current) : "insert";
      const fp = suggestionFingerprint("insert_prompt", key);
      if (!isSuggestionDismissed(input.overlay, fp) && !isSuggestionInCooldown(input.overlay, cooldownKeyFor("insert_prompt"), input.now)) {
        return {
          kind: "insert_prompt",
          afterActivityKey: key,
          title: insert.title,
          category: insert.category,
          durationMinutes: insert.durationMinutes,
          message: insert.message,
        };
      }
    }
  }

  return null;
};
