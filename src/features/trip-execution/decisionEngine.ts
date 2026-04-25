import type { DecisionResult, DecisionRecommendedAction, TripExecutionState, TripPlanItem } from "./decisionEngine.types";
import {
  compareRemoval,
  isoToMs,
  isRemovablePriority,
  minutesBetweenUtc,
  remainingItems,
  reorderForWeatherRisk,
  sortByPlannedStart,
  totalRequiredMinutes,
  wallTimeOnSameLocalDayMs,
} from "./decisionEngine.utils";

const delayGraceMinutes = (mode: TripExecutionState["userMode"]): number => {
  if (mode === "slow") {
    return 10;
  }
  if (mode === "balanced") {
    return 5;
  }
  return 0;
};

const findCurrentItem = (ordered: readonly TripPlanItem[], nowMs: number): TripPlanItem | undefined =>
  ordered.find((item) => {
    const start = isoToMs(item.plannedStartTime);
    const end = isoToMs(item.plannedEndTime);
    return nowMs >= start && nowMs < end;
  });

const buildExplanation = (parts: string[]): string => parts.filter(Boolean).join(" ");

export const decide = (state: TripExecutionState): DecisionResult => {
  const nowMs = isoToMs(state.now);
  const dayEndMs = wallTimeOnSameLocalDayMs(state.now, state.dayEndTime);
  const dayStartMs = wallTimeOnSameLocalDayMs(state.now, state.dayStartTime);

  if (dayEndMs <= dayStartMs) {
    throw new Error("dayEndTime must be after dayStartTime on the same local day.");
  }

  let available = minutesBetweenUtc(nowMs, dayEndMs);
  if (state.energyLevel === "low") {
    available = Math.floor(available * 0.75);
  }

  const weatherRisk = state.weatherRisk ?? "none";
  let working = sortByPlannedStart(remainingItems(state.items, state.completedItemIds, state.skippedItemIds));
  const initialOrderIds = working.map((i) => i.id);
  const reordered = reorderForWeatherRisk(working, weatherRisk);
  const didReorder = reordered.some((item, index) => item.id !== initialOrderIds[index]);
  working = reordered;
  const initialRequired = totalRequiredMinutes(working);

  const removed: TripPlanItem[] = [];

  if (working.length === 0) {
    return {
      status: "on_track",
      recommendedAction: "end_day",
      removedItems: [],
      reorderedItems: didReorder ? reordered : [],
      explanation: buildExplanation([
        "There are no remaining stops for today.",
        didReorder ? "Remaining items were ordered with indoor-first preference for high weather risk." : "",
      ]),
    };
  }

  const graceMs = delayGraceMinutes(state.userMode) * 60_000;
  const first = working[0];
  const delayed = Boolean(first && nowMs > isoToMs(first.plannedStartTime) + graceMs);

  let required = initialRequired;
  const initiallyOverloaded = initialRequired > available;

  const pool = (): TripPlanItem[] =>
    [...working].filter((item) => isRemovablePriority(item.priority)).sort((a, b) => compareRemoval(a, b, weatherRisk));

  let removable = pool();
  while (required > available && removable.length > 0) {
    const victim = removable.shift()!;
    removed.push(victim);
    working = working.filter((item) => item.id !== victim.id);
    required = totalRequiredMinutes(working);
    removable = pool();
  }

  const stillInfeasible = required > available;
  if (stillInfeasible) {
    return {
      status: "needs_replan",
      recommendedAction: "reorder_remaining",
      nextItem: working[0],
      removedItems: removed,
      reorderedItems: didReorder || weatherRisk === "high" ? [...working] : [],
      explanation: buildExplanation([
        "Even after dropping every non-must stop, the remaining work still does not fit before the end of the day window.",
        `About ${required} minutes are still needed with only ${available} minutes left (after energy adjustment).`,
        `The original remaining workload was about ${initialRequired} minutes.`,
        "Replan the day manually or move must-see items to another day.",
      ]),
    };
  }

  working = weatherRisk === "high" ? reorderForWeatherRisk(working, weatherRisk) : sortByPlannedStart(working);

  const nextItem = working[0];
  const current = findCurrentItem(working, nowMs);

  let status: DecisionResult["status"];
  if (initiallyOverloaded && removed.length > 0) {
    status = "overloaded";
  } else if (delayed) {
    status = "delayed";
  } else {
    status = "on_track";
  }

  let recommendedAction: DecisionRecommendedAction = "continue";
  if (removed.length > 0) {
    recommendedAction = "skip_next_low_priority";
  } else if (didReorder && weatherRisk === "high") {
    recommendedAction = "reorder_remaining";
  } else if (delayed && current && required <= available * 0.92) {
    recommendedAction = "shorten_current_item";
  } else if (available <= 15 && working.length > 0) {
    recommendedAction = "end_day";
  }

  const explanation = buildExplanation([
    initiallyOverloaded
      ? `The original remaining plan needed about ${initialRequired} minutes but only about ${available} minutes remain in the day window (after energy adjustment).`
      : `About ${required} minutes of activity and travel remain with about ${available} minutes left in the day window.`,
    delayed ? "You are running later than the next stop's planned start (including a small grace window)." : "You are on time relative to the next stop.",
    removed.length > 0
      ? `Removed ${removed.length} lower-priority stop(s) (${removed.map((r) => r.title).join(", ")}) so the rest can still fit.`
      : "",
    didReorder && weatherRisk === "high" ? "High weather risk: remaining stops were ordered indoor-first." : "",
    recommendedAction === "shorten_current_item" && current
      ? `Consider shortening "${current.title}" so later stops can still start on time.`
      : "",
    recommendedAction === "end_day" ? "Very little time is left in the day window — consider wrapping up." : "",
  ]);

  const reorderedItemsOut = didReorder || weatherRisk === "high" ? [...working] : [];

  return {
    status,
    recommendedAction,
    nextItem,
    removedItems: removed,
    reorderedItems: reorderedItemsOut,
    explanation,
  };
};
