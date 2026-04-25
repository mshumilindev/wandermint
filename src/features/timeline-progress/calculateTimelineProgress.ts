import { decide } from "../trip-execution/decisionEngine";
import type { TripExecutionState, TripPlanItem } from "../trip-execution/decisionEngine.types";
import { isoToMs, remainingItems, sortByPlannedStart } from "../trip-execution/decisionEngine.utils";
import type { TimelineProgress, TimelineProgressStatus } from "./timelineProgress.types";

const EARLY_AHEAD_MS = 10 * 60 * 1000;

const isValidScheduleIso = (iso: string): boolean => Number.isFinite(Date.parse(iso));

const hasFixedSchedule = (items: TripPlanItem[]): boolean => {
  if (items.length === 0) {
    return false;
  }
  return items.every((i) => {
    if (!isValidScheduleIso(i.plannedStartTime) || !isValidScheduleIso(i.plannedEndTime)) {
      return false;
    }
    try {
      return isoToMs(i.plannedEndTime) > isoToMs(i.plannedStartTime);
    } catch {
      return false;
    }
  });
};

const countStatuses = (
  items: TripPlanItem[],
  completedIds: readonly string[],
  skippedIds: readonly string[],
): { completedCount: number; skippedCount: number; remainingCount: number; plannedOrdered: TripPlanItem[] } => {
  const completedSet = new Set(completedIds);
  const skippedSet = new Set(skippedIds);
  let completedCount = 0;
  let skippedCount = 0;
  for (const i of items) {
    const done = i.status === "completed" || completedSet.has(i.id);
    const skip = i.status === "skipped" || skippedSet.has(i.id);
    if (done) {
      completedCount += 1;
    } else if (skip) {
      skippedCount += 1;
    }
  }
  const plannedOrdered = items.filter(
    (i) => i.status === "planned" && !completedSet.has(i.id) && !skippedSet.has(i.id),
  );
  return { completedCount, skippedCount, remainingCount: plannedOrdered.length, plannedOrdered };
};

const countOnlyProgress = (
  items: TripPlanItem[],
  completedIds: readonly string[],
  skippedIds: readonly string[],
): TimelineProgress => {
  const { completedCount, skippedCount, remainingCount, plannedOrdered } = countStatuses(items, completedIds, skippedIds);
  let status: TimelineProgressStatus = "on_track";
  if (remainingCount === 0) {
    status = "finished";
  } else if (completedCount === 0 && skippedCount === 0) {
    status = "not_started";
  }
  return {
    completedCount,
    skippedCount,
    remainingCount,
    currentItem: plannedOrdered[0],
    nextItem: plannedOrdered[1],
    delayMinutes: 0,
    status,
  };
};

const findCurrentSlot = (remaining: TripPlanItem[], nowMs: number): TripPlanItem | undefined => {
  for (const i of remaining) {
    const start = isoToMs(i.plannedStartTime);
    const end = isoToMs(i.plannedEndTime);
    if (nowMs >= start && nowMs < end) {
      return i;
    }
  }
  for (const i of remaining) {
    const end = isoToMs(i.plannedEndTime);
    if (nowMs >= end) {
      return i;
    }
  }
  return undefined;
};

const resolveNext = (remaining: TripPlanItem[], current: TripPlanItem | undefined): TripPlanItem | undefined => {
  if (remaining.length === 0) {
    return undefined;
  }
  if (!current) {
    return remaining[0];
  }
  const idx = remaining.findIndex((i) => i.id === current.id);
  if (idx >= 0 && idx < remaining.length - 1) {
    return remaining[idx + 1];
  }
  return undefined;
};

/**
 * Derives a compact progress summary from a {@link TripExecutionState} and its embedded `now` instant.
 * Uses schedule times when all items have valid ISO start/end; otherwise count-only mode (rule 4).
 */
export const calculateTimelineProgress = (execution: TripExecutionState): TimelineProgress => {
  const rawItems = execution.items;
  if (!hasFixedSchedule(rawItems)) {
    return countOnlyProgress(rawItems, execution.completedItemIds, execution.skippedItemIds);
  }

  let items: TripPlanItem[];
  try {
    items = sortByPlannedStart(rawItems);
  } catch {
    return countOnlyProgress(rawItems, execution.completedItemIds, execution.skippedItemIds);
  }

  const nowMs = isoToMs(execution.now);
  const { completedCount, skippedCount, remainingCount } = countStatuses(items, execution.completedItemIds, execution.skippedItemIds);

  if (remainingCount === 0) {
    return {
      completedCount,
      skippedCount,
      remainingCount: 0,
      delayMinutes: 0,
      status: "finished",
    };
  }

  let decision: ReturnType<typeof decide>;
  try {
    decision = decide(execution);
  } catch {
    return countOnlyProgress(rawItems, execution.completedItemIds, execution.skippedItemIds);
  }

  let remaining: TripPlanItem[];
  try {
    remaining = sortByPlannedStart(
      remainingItems(execution.items, execution.completedItemIds, execution.skippedItemIds),
    );
  } catch {
    return countOnlyProgress(rawItems, execution.completedItemIds, execution.skippedItemIds);
  }

  const first = remaining[0];
  const firstStartMs = first ? isoToMs(first.plannedStartTime) : nowMs;

  let status: TimelineProgressStatus = "on_track";
  if (first && nowMs < firstStartMs - EARLY_AHEAD_MS) {
    status = "ahead";
  } else if (first && nowMs < firstStartMs) {
    status = "not_started";
  } else if (decision.status === "delayed" || decision.status === "overloaded" || decision.status === "needs_replan") {
    status = "delayed";
  } else {
    status = "on_track";
  }

  const currentItem = findCurrentSlot(remaining, nowMs);
  const nextItem = resolveNext(remaining, currentItem);

  let delayMinutes = 0;
  if (status === "delayed" && first) {
    delayMinutes = Math.max(0, Math.round((nowMs - firstStartMs) / 60_000));
  }

  return {
    completedCount,
    skippedCount,
    remainingCount,
    currentItem,
    nextItem,
    delayMinutes,
    status,
  };
};
