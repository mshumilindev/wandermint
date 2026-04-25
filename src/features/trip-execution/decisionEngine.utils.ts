import type { TripPlanItem, TripPlanPriority } from "./decisionEngine.types";

const MS_PER_MINUTE = 60_000;

/**
 * Parse `HH:mm` (24h) on the **same local calendar day** as `anchorIso`.
 * Uses the runtime local timezone (deterministic tests should fix `TZ` if needed).
 */
export const wallTimeOnSameLocalDayMs = (anchorIso: string, wallTime: string): number => {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error(`Invalid anchor ISO datetime: ${anchorIso}`);
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(wallTime.trim());
  if (!match) {
    throw new Error(`Invalid wall time (expected HH:mm): ${wallTime}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Wall time out of range: ${wallTime}`);
  }

  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), hours, minutes, 0, 0).getTime();
};

export const isoToMs = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO datetime: ${iso}`);
  }
  return ms;
};

export const minutesBetweenUtc = (fromMs: number, toMs: number): number => Math.max(0, Math.round((toMs - fromMs) / MS_PER_MINUTE));

export const priorityRank = (priority: TripPlanPriority): number => {
  switch (priority) {
    case "must":
      return 3;
    case "high":
      return 2;
    case "medium":
      return 1;
    case "low":
      return 0;
    default: {
      const exhaustive: never = priority;
      return exhaustive;
    }
  }
};

export const isRemovablePriority = (priority: TripPlanPriority): boolean => priority !== "must";

export const sortByPlannedStart = (items: TripPlanItem[]): TripPlanItem[] =>
  [...items].sort((a, b) => isoToMs(a.plannedStartTime) - isoToMs(b.plannedStartTime));

export const remainingItems = (
  items: TripPlanItem[],
  completedItemIds: readonly string[],
  skippedItemIds: readonly string[],
): TripPlanItem[] => {
  const completed = new Set(completedItemIds);
  const skipped = new Set(skippedItemIds);
  return items.filter((item) => !completed.has(item.id) && !skipped.has(item.id));
};

export const totalRequiredMinutes = (ordered: readonly TripPlanItem[]): number => {
  let sum = 0;
  for (const item of ordered) {
    sum += item.travelTimeFromPreviousMinutes + item.estimatedDurationMinutes;
  }
  return sum;
};

/** Indoor-first when weather is risky (stable among ties). */
export const reorderForWeatherRisk = (items: TripPlanItem[], weatherRisk: "none" | "low" | "medium" | "high"): TripPlanItem[] => {
  if (weatherRisk !== "high") {
    return [...items];
  }

  const indoorScore = (item: TripPlanItem): number => {
    const tag = item.location.indoorOutdoor;
    if (tag === "indoor") {
      return 0;
    }
    if (tag === "mixed") {
      return 1;
    }
    if (tag === "outdoor") {
      return 2;
    }
    return 1;
  };

  return sortByPlannedStart(items).sort((a, b) => {
    const diff = indoorScore(a) - indoorScore(b);
    if (diff !== 0) {
      return diff;
    }
    return isoToMs(a.plannedStartTime) - isoToMs(b.plannedStartTime);
  });
};

/**
 * Removal preference: lower priority first; under high weather risk, outdoor before indoor/mixed.
 */
export const removalSortKey = (
  item: TripPlanItem,
  weatherRisk: "none" | "low" | "medium" | "high",
): [number, number, number] => {
  const pr = priorityRank(item.priority);
  const outdoorFirst = weatherRisk === "high" ? (item.location.indoorOutdoor === "outdoor" ? 0 : 1) : 0;
  return [pr, outdoorFirst, isoToMs(item.plannedStartTime)];
};

export const compareRemoval = (
  a: TripPlanItem,
  b: TripPlanItem,
  weatherRisk: "none" | "low" | "medium" | "high",
): number => {
  const [pa, oa, ta] = removalSortKey(a, weatherRisk);
  const [pb, ob, tb] = removalSortKey(b, weatherRisk);
  if (pa !== pb) {
    return pa - pb;
  }
  if (oa !== ob) {
    return oa - ob;
  }
  return tb - ta;
};
