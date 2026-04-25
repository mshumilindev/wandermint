import { isoToMs } from "../trip-execution/decisionEngine.utils";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import type { CompletedTrip } from "./tripReview.types";

const MS_PER_MINUTE = 60_000;
const OVERLOAD_SKIP_RATIO = 0.3;
const MEAL_GAP_WARN_MINUTES = 4 * 60;
const ACTIVE_DAY_ACTIVITY_MINUTES = 6 * 60;
const MIN_MEALS_ON_HEAVY_DAY = 2;

export type CategoryRollup = {
  typeKey: string;
  label: string;
  total: number;
  completed: number;
  skipped: number;
};

export type DayRollup = {
  dateKey: string;
  total: number;
  completed: number;
  skipped: number;
};

export type TripReviewComputation = {
  completionRate: number;
  skipRate: number;
  averageDelayMinutes: number;
  mostSkippedCategories: string[];
  overloadedDays: string[];
  categoryRollups: CategoryRollup[];
  dayRollups: DayRollup[];
  /** Delays in minutes (late starts vs planned), completed items with actual + planned start only. */
  delaySamples: { minutesLate: number; plannedStartMs: number }[];
  morningDelayMinutes: number[];
  afternoonDelayMinutes: number[];
  /** Average lateness of actual end vs planned end (completed items only); 0 if no data. */
  averageEndDelayMinutes: number;
  mealInsufficient: boolean;
  maxMealGapMinutes: number;
  skippedMustTitles: string[];
  maxItemsOnSingleDay: number;
  heaviestDayKeys: string[];
};

const normalizeTypeKey = (item: TripPlanItem): string => item.type.trim().toLowerCase() || "other";

const displayLabel = (typeKey: string): string =>
  typeKey === "other"
    ? "Other"
    : typeKey
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

const isMealOrRestLike = (item: TripPlanItem): boolean => {
  const t = item.type.trim().toLowerCase();
  if (t === "meal" || t === "rest" || t === "break" || t === "food") {
    return true;
  }
  const hay = `${item.type} ${item.title}`.toLowerCase();
  return /\b(lunch|dinner|brunch|break|coffee|café|cafe|snack|meal|rest)\b/.test(hay);
};

const dateKeyFromPlannedStart = (plannedStartTime: string): string | null => {
  const ms = Date.parse(plannedStartTime);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString().slice(0, 10);
};

const plannedItemById = (trip: CompletedTrip): Map<string, TripPlanItem> => {
  const map = new Map<string, TripPlanItem>();
  for (const item of trip.plannedItems) {
    map.set(item.id, item);
  }
  return map;
};

/** Completed wins if an id appears in both lists. */
const resolvedCompletionSets = (trip: CompletedTrip): { completed: Set<string>; skipped: Set<string> } => {
  const completed = new Set(trip.completedItemIds);
  const skipped = new Set(trip.skippedItemIds);
  for (const id of completed) {
    skipped.delete(id);
  }
  return { completed, skipped };
};

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const minutesLateStart = (plannedIso: string, actualIso: string): number => {
  const planned = isoToMs(plannedIso);
  const actual = isoToMs(actualIso);
  return Math.max(0, Math.round((actual - planned) / MS_PER_MINUTE));
};

const minutesLateEnd = (plannedIso: string, actualIso: string): number => {
  const planned = isoToMs(plannedIso);
  const actual = isoToMs(actualIso);
  return Math.max(0, Math.round((actual - planned) / MS_PER_MINUTE));
};

const isAfternoonPlan = (plannedStartTime: string): boolean => {
  const ms = Date.parse(plannedStartTime);
  if (Number.isNaN(ms)) {
    return false;
  }
  return new Date(ms).getUTCHours() >= 13;
};

const maxMealGapAndInsufficientByDay = (
  itemsByDay: Map<string, TripPlanItem[]>,
): { maxGap: number; insufficient: boolean } => {
  let maxGap = 0;
  let insufficient = false;

  for (const [, dayItems] of itemsByDay) {
    const sorted = [...dayItems].sort((a, b) => isoToMs(a.plannedStartTime) - isoToMs(b.plannedStartTime));
    const meals = sorted.filter(isMealOrRestLike);

    for (let i = 1; i < meals.length; i++) {
      const prevMeal = meals[i - 1];
      const curMeal = meals[i];
      if (!prevMeal || !curMeal) {
        continue;
      }
      const g = minutesBetweenStarts(
        prevMeal.plannedEndTime ?? prevMeal.plannedStartTime,
        curMeal.plannedStartTime,
      );
      maxGap = Math.max(maxGap, g);
      if (g >= MEAL_GAP_WARN_MINUTES) {
        insufficient = true;
      }
    }

    if (meals.length === 1 && sorted.length >= 4) {
      const m0 = meals[0];
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (m0 && first && last) {
        maxGap = Math.max(
          maxGap,
          minutesBetweenStarts(first.plannedStartTime, m0.plannedStartTime),
          minutesBetweenStarts(m0.plannedEndTime ?? m0.plannedStartTime, last.plannedStartTime),
        );
      }
    }

    const activityMinutes = sorted
      .filter((i) => !isMealOrRestLike(i))
      .reduce((s, i) => s + Math.max(0, i.estimatedDurationMinutes), 0);

    if (activityMinutes >= ACTIVE_DAY_ACTIVITY_MINUTES && meals.length < MIN_MEALS_ON_HEAVY_DAY) {
      insufficient = true;
    }
    if (sorted.length >= 5 && meals.length === 0) {
      insufficient = true;
    }
  }

  return { maxGap, insufficient };
};

const minutesBetweenStarts = (fromIso: string, toIso: string): number => {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.max(0, Math.round((b - a) / MS_PER_MINUTE));
};

const groupItemsByDay = (items: readonly TripPlanItem[]): Map<string, TripPlanItem[]> => {
  const map = new Map<string, TripPlanItem[]>();
  for (const item of items) {
    const key = dateKeyFromPlannedStart(item.plannedStartTime);
    if (!key) {
      continue;
    }
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
};

/**
 * Core metrics and structured facts for {@link ../tripReviewSummary.buildTripReview}.
 */
export const analyzeCompletedTrip = (trip: CompletedTrip): TripReviewComputation => {
  const { completed, skipped } = resolvedCompletionSets(trip);
  const byId = plannedItemById(trip);
  const n = trip.plannedItems.length;

  const completionRate = n === 0 ? 0 : trip.plannedItems.filter((i) => completed.has(i.id)).length / n;
  const skipRate = n === 0 ? 0 : trip.plannedItems.filter((i) => skipped.has(i.id)).length / n;

  const delaySamples: { minutesLate: number; plannedStartMs: number }[] = [];
  const morningDelayMinutes: number[] = [];
  const afternoonDelayMinutes: number[] = [];

  if (trip.actualStartTimes) {
    for (const id of completed) {
      const item = byId.get(id);
      const actual = trip.actualStartTimes[id];
      if (!item || !actual) {
        continue;
      }
      try {
        const late = minutesLateStart(item.plannedStartTime, actual);
        delaySamples.push({ minutesLate: late, plannedStartMs: isoToMs(item.plannedStartTime) });
        if (isAfternoonPlan(item.plannedStartTime)) {
          afternoonDelayMinutes.push(late);
        } else {
          morningDelayMinutes.push(late);
        }
      } catch {
        // ignore invalid ISO
      }
    }
  }

  const averageDelayMinutes = mean(delaySamples.map((d) => d.minutesLate));

  const endDelayMinutes: number[] = [];
  if (trip.actualEndTimes) {
    for (const id of completed) {
      const item = byId.get(id);
      const actualEnd = trip.actualEndTimes[id];
      if (!item?.plannedEndTime || !actualEnd) {
        continue;
      }
      try {
        endDelayMinutes.push(minutesLateEnd(item.plannedEndTime, actualEnd));
      } catch {
        // ignore invalid ISO
      }
    }
  }
  const averageEndDelayMinutes = mean(endDelayMinutes);

  const categoryMap = new Map<string, CategoryRollup>();
  for (const item of trip.plannedItems) {
    const typeKey = normalizeTypeKey(item);
    const cur =
      categoryMap.get(typeKey) ??
      ({
        typeKey,
        label: displayLabel(typeKey),
        total: 0,
        completed: 0,
        skipped: 0,
      } satisfies CategoryRollup);
    cur.total += 1;
    if (completed.has(item.id)) {
      cur.completed += 1;
    } else if (skipped.has(item.id)) {
      cur.skipped += 1;
    }
    categoryMap.set(typeKey, cur);
  }
  const categoryRollups = [...categoryMap.values()].sort((a, b) => b.skipped - a.skipped || b.total - a.total);

  const dayMap = new Map<string, DayRollup>();
  for (const item of trip.plannedItems) {
    const dateKey = dateKeyFromPlannedStart(item.plannedStartTime);
    if (!dateKey) {
      continue;
    }
    const cur = dayMap.get(dateKey) ?? { dateKey, total: 0, completed: 0, skipped: 0 };
    cur.total += 1;
    if (completed.has(item.id)) {
      cur.completed += 1;
    } else if (skipped.has(item.id)) {
      cur.skipped += 1;
    }
    dayMap.set(dateKey, cur);
  }
  const dayRollups = [...dayMap.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const overloadedDays = dayRollups
    .filter((d) => d.total > 0 && d.skipped / d.total > OVERLOAD_SKIP_RATIO)
    .map((d) => d.dateKey);

  const mostSkippedCategories = categoryRollups
    .filter((c) => c.skipped >= 2 || (c.total >= 3 && c.skipped / c.total >= 0.4))
    .slice(0, 5)
    .map((c) => c.label);

  const itemsByDay = groupItemsByDay(trip.plannedItems);
  const { maxGap: maxMealGapMinutes, insufficient: mealInsufficientFromGaps } = maxMealGapAndInsufficientByDay(itemsByDay);

  let mealInsufficient = mealInsufficientFromGaps;
  if (maxMealGapMinutes >= MEAL_GAP_WARN_MINUTES) {
    mealInsufficient = true;
  }

  const skippedMustTitles = trip.plannedItems
    .filter((i) => i.priority === "must" && skipped.has(i.id))
    .map((i) => i.title);

  let maxItemsOnSingleDay = 0;
  const heaviestDayKeys: string[] = [];
  for (const d of dayRollups) {
    if (d.total > maxItemsOnSingleDay) {
      maxItemsOnSingleDay = d.total;
    }
  }
  for (const d of dayRollups) {
    if (d.total === maxItemsOnSingleDay && maxItemsOnSingleDay > 0) {
      heaviestDayKeys.push(d.dateKey);
    }
  }

  return {
    completionRate,
    skipRate,
    averageDelayMinutes,
    mostSkippedCategories,
    overloadedDays,
    categoryRollups,
    dayRollups,
    delaySamples,
    morningDelayMinutes,
    afternoonDelayMinutes,
    averageEndDelayMinutes,
    mealInsufficient,
    maxMealGapMinutes,
    skippedMustTitles,
    maxItemsOnSingleDay,
    heaviestDayKeys,
  };
};
