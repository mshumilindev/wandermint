import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { buildGeoClustersFromItems } from "../geo-clustering/clusterTripItems";
import { validatePlanWindowAgainstOpeningHours } from "../places/opening-hours/openingHoursValidator";
import { estimateTransportTimeSync } from "../transport/transportTimeResolver";
import {
  defaultBufferMinutesBetween,
  inferDistanceHintFromTravelMeta,
} from "../trip-planning/timeline/timelineCalculator";
import type { TransportMode } from "../transport/transport.types";
import type { TripPlanItem, TripPlanPriority } from "../trip-execution/decisionEngine.types";
import type {
  MealRestRequirement,
  RejectedTripPlanItem,
  SolveTripDayInput,
  SolvedTripDay,
} from "./constraintSolver.types";

dayjs.extend(utc);
dayjs.extend(timezone);

const PRIORITY_RANK: Record<TripPlanPriority, number> = {
  must: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_WEIGHT: Record<TripPlanPriority, number> = {
  must: 8,
  high: 4,
  medium: 2,
  low: 1,
};

const wallInstant = (dayDate: string, wallMinutesFromMidnight: number, tz: string): dayjs.Dayjs =>
  dayjs.tz(`${dayDate} 00:00`, "YYYY-MM-DD HH:mm", tz).add(wallMinutesFromMidnight, "minute");

const parseDayBounds = (
  dayDate: string,
  dayStartTime: string,
  dayEndTime: string,
  tz: string,
): { dayStart: dayjs.Dayjs; dayEnd: dayjs.Dayjs } | null => {
  const dayStart = dayjs.tz(`${dayDate} ${dayStartTime.trim()}`, "YYYY-MM-DD HH:mm", tz);
  const dayEnd = dayjs.tz(`${dayDate} ${dayEndTime.trim()}`, "YYYY-MM-DD HH:mm", tz);
  if (!dayStart.isValid() || !dayEnd.isValid() || !dayEnd.isAfter(dayStart)) {
    return null;
  }
  return { dayStart, dayEnd };
};

const clusterSortKey = (candidates: readonly TripPlanItem[], linkageMeters: number): Map<string, number> => {
  const points: { id: string; lat: number; lng: number }[] = candidates
    .filter((c) => Number.isFinite(c.location.lat) && Number.isFinite(c.location.lng))
    .map((c) => ({ id: c.id, lat: c.location.lat, lng: c.location.lng }));
  const clusters = buildGeoClustersFromItems(points, { linkageMeters });
  const map = new Map<string, number>();
  clusters.forEach((cluster, index) => {
    for (const id of cluster.itemIds) {
      map.set(id, index);
    }
  });
  return map;
};

const sortCandidatesForSolver = (candidates: TripPlanItem[], clusterRank: Map<string, number>): TripPlanItem[] =>
  [...candidates].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) {
      return pr;
    }
    const ca = clusterRank.get(a.id) ?? 9999;
    const cb = clusterRank.get(b.id) ?? 9999;
    if (ca !== cb) {
      return ca - cb;
    }
    return a.id.localeCompare(b.id);
  });

const paceBufferDelta = (pace: SolveTripDayInput["pace"]): number => {
  if (pace === "slow") {
    return 10;
  }
  if (pace === "dense") {
    return -5;
  }
  return 0;
};

const applyPaceToBuffer = (base: number, pace: SolveTripDayInput["pace"]): number => {
  const next = base + paceBufferDelta(pace);
  return Math.max(0, next);
};

const cloneItemWithWindow = (
  item: TripPlanItem,
  startIso: string,
  endIso: string,
  travelFromPrev: number,
): TripPlanItem => ({
  ...item,
  plannedStartTime: startIso,
  plannedEndTime: endIso,
  travelTimeFromPreviousMinutes: travelFromPrev,
});

type TimeGap = {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
  anchor: TripPlanItem["location"];
};

const buildTimeGaps = (rows: TripPlanItem[], dayStart: dayjs.Dayjs, dayEnd: dayjs.Dayjs, tz: string): TimeGap[] => {
  const gaps: TimeGap[] = [];
  const sorted = [...rows].sort((a, b) => dayjs(a.plannedStartTime).valueOf() - dayjs(b.plannedStartTime).valueOf());
  if (sorted.length === 0) {
    return gaps;
  }
  const first = sorted[0];
  if (!first) {
    return gaps;
  }
  const firstStart = dayjs(first.plannedStartTime).tz(tz);
  if (firstStart.isAfter(dayStart)) {
    gaps.push({ start: dayStart, end: firstStart, anchor: first.location });
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cur = sorted[i];
    const nxt = sorted[i + 1];
    if (!cur || !nxt) {
      continue;
    }
    const endCur = dayjs(cur.plannedEndTime).tz(tz);
    const startNxt = dayjs(nxt.plannedStartTime).tz(tz);
    if (startNxt.isAfter(endCur)) {
      gaps.push({ start: endCur, end: startNxt, anchor: cur.location });
    }
  }
  const last = sorted[sorted.length - 1];
  if (!last) {
    return gaps;
  }
  const lastEnd = dayjs(last.plannedEndTime).tz(tz);
  if (dayEnd.isAfter(lastEnd)) {
    gaps.push({ start: lastEnd, end: dayEnd, anchor: last.location });
  }
  return gaps;
};

const later = (a: dayjs.Dayjs, b: dayjs.Dayjs): dayjs.Dayjs => (a.isAfter(b) ? a : b);
const earlier = (a: dayjs.Dayjs, b: dayjs.Dayjs): dayjs.Dayjs => (a.isBefore(b) ? a : b);

const recomputeTravelChain = (rows: TripPlanItem[], mode: TransportMode): TripPlanItem[] => {
  const sorted = [...rows].sort((a, b) => dayjs(a.plannedStartTime).valueOf() - dayjs(b.plannedStartTime).valueOf());
  return sorted.map((it, index) => {
    if (index === 0) {
      return { ...it, travelTimeFromPreviousMinutes: 0 };
    }
    const prev = sorted[index - 1];
    if (!prev) {
      return { ...it, travelTimeFromPreviousMinutes: 0 };
    }
    const t = estimateTransportTimeSync({
      from: prev.location,
      to: it.location,
      mode,
      departureTime: prev.plannedEndTime,
    }).durationMinutes;
    return { ...it, travelTimeFromPreviousMinutes: Math.max(0, t) };
  });
};

const insertMealRests = (
  placed: TripPlanItem[],
  requirements: readonly MealRestRequirement[],
  dayDate: string,
  tz: string,
  dayStart: dayjs.Dayjs,
  dayEnd: dayjs.Dayjs,
  mode: TransportMode,
): { items: TripPlanItem[]; missed: string[] } => {
  if (requirements.length === 0) {
    return { items: recomputeTravelChain(placed, mode), missed: [] };
  }
  if (placed.length === 0) {
    const missed = requirements.map((r) => `No activities to schedule around for meal/rest "${r.id}".`);
    return { items: [], missed };
  }

  const sortedReq = [...requirements].sort((a, b) => a.earliestStartWallMinutes - b.earliestStartWallMinutes);
  let items = [...placed];
  const missed: string[] = [];

  for (const req of sortedReq) {
    const earliest = wallInstant(dayDate, req.earliestStartWallMinutes, tz);
    const latestStart = wallInstant(dayDate, req.latestStartWallMinutes, tz);
    if (!earliest.isValid() || !latestStart.isValid() || latestStart.isBefore(earliest)) {
      missed.push(`Invalid meal/rest window for "${req.id}".`);
      continue;
    }

    const dur = Math.max(1, req.durationMinutes);
    const gaps = buildTimeGaps(items, dayStart, dayEnd, tz);
    let inserted: TripPlanItem | null = null;

    for (const { start: gapStart, end: gapEnd, anchor } of gaps) {
      if (!gapEnd.isAfter(gapStart)) {
        continue;
      }
      const gapEndMinusDur = gapEnd.subtract(dur, "minute");
      if (!gapEndMinusDur.isValid() || gapEndMinusDur.isBefore(gapStart)) {
        continue;
      }
      const sLow = later(gapStart, earliest);
      const sHigh = earlier(gapEndMinusDur, latestStart);
      if (sHigh.isBefore(sLow)) {
        continue;
      }
      const start = sLow;
      const end = start.add(dur, "minute");
      if (end.isAfter(gapEnd)) {
        continue;
      }

      inserted = {
        id: `solver-${req.id}`,
        title: req.label ?? (req.kind === "meal" ? "Meal break" : "Rest"),
        type: req.kind === "meal" ? "meal" : "rest",
        priority: "low",
        location: { ...anchor },
        plannedStartTime: start.toISOString(),
        plannedEndTime: end.toISOString(),
        estimatedDurationMinutes: dur,
        travelTimeFromPreviousMinutes: 0,
        status: "planned",
      };
      items.push(inserted);
      items = items.sort((a, b) => dayjs(a.plannedStartTime).valueOf() - dayjs(b.plannedStartTime).valueOf());
      break;
    }

    if (!inserted) {
      missed.push(`No free window for meal/rest "${req.id}" (${dur}m).`);
    }
  }

  return { items: recomputeTravelChain(items, mode), missed };
};

/** Deterministic constraint pass: final times and order come from rules, not AI ordering. */
export const solveTripDay = (input: SolveTripDayInput): SolvedTripDay => {
  const rejectedItems: RejectedTripPlanItem[] = [];
  const infeasibilityReasons: string[] = [];
  const tz = input.timezone.trim();
  const bounds = parseDayBounds(input.dayDate, input.dayStartTime, input.dayEndTime, tz);
  if (!bounds) {
    return {
      items: [],
      rejectedItems: input.candidates.map((item) => ({
        item,
        reason: "Invalid day window (start/end or timezone).",
      })),
      feasibilityScore: 0,
      infeasibilityReasons: ["Day bounds could not be parsed."],
    };
  }
  const { dayStart, dayEnd } = bounds;
  const mode = input.transportMode ?? "walking";
  const pace = input.pace ?? "balanced";
  const linkage = input.clusterLinkageMeters ?? 400;
  const clusterRank = clusterSortKey(input.candidates, linkage);
  const sorted = sortCandidatesForSolver(input.candidates, clusterRank);

  const placed: TripPlanItem[] = [];
  let prev: TripPlanItem | undefined;
  let cursor = dayStart;
  let spendCents = Math.max(0, input.baselineSpendCents ?? 0);
  const budgetMax = input.budgetDailyMaxCents;

  for (const item of sorted) {
    let travelMin = 0;
    if (prev) {
      const leg = estimateTransportTimeSync({
        from: prev.location,
        to: item.location,
        mode,
        departureTime: cursor.toISOString(),
      });
      travelMin = Math.max(0, leg.durationMinutes);
      const hint = inferDistanceHintFromTravelMeta(travelMin, undefined, leg.confidence);
      const buffer = applyPaceToBuffer(defaultBufferMinutesBetween(hint), pace);
      cursor = cursor.add(travelMin + buffer, "minute");
    }

    const dur = Math.max(1, item.estimatedDurationMinutes);
    const propStart = cursor;
    const propEnd = propStart.add(dur, "minute");
    if (propEnd.isAfter(dayEnd)) {
      rejectedItems.push({
        item,
        reason: "Activity would end after the scheduled day end (including travel and buffers).",
      });
      continue;
    }

    const oh = input.openingHoursByItemId?.[item.id] ?? undefined;
    const tzOh = (item.openingHoursTimezone ?? oh?.timezone ?? tz).trim();
    const startIso = propStart.tz(tzOh).toISOString();
    const endIso = propEnd.tz(tzOh).toISOString();

    if (oh) {
      const validation = validatePlanWindowAgainstOpeningHours(oh, startIso, endIso);
      if (validation.status === "closed") {
        rejectedItems.push({
          item,
          reason: validation.reason ?? "Place is closed for the planned window.",
        });
        continue;
      }
    }

    const itemSpend = input.estimatedSpendCentsByItemId?.[item.id] ?? 0;
    if (budgetMax !== undefined && itemSpend > 0) {
      if (spendCents + itemSpend > budgetMax) {
        rejectedItems.push({
          item,
          reason: "Would exceed the daily budget cap.",
        });
        continue;
      }
      spendCents += itemSpend;
    }

    const next = cloneItemWithWindow(item, startIso, endIso, prev ? travelMin : 0);
    placed.push(next);
    prev = next;
    cursor = propEnd;
  }

  const mealPass = insertMealRests(placed, input.mealRestRequirements ?? [], input.dayDate, tz, dayStart, dayEnd, mode);
  const finalItems = mealPass.items;
  for (const m of mealPass.missed) {
    infeasibilityReasons.push(m);
  }

  const totalWeight = input.candidates.reduce((s, c) => s + PRIORITY_WEIGHT[c.priority], 0);
  const placedIds = new Set(finalItems.map((i) => i.id));
  const placedWeight = input.candidates.filter((c) => placedIds.has(c.id)).reduce((s, c) => s + PRIORITY_WEIGHT[c.priority], 0);

  let feasibilityScore = totalWeight > 0 ? placedWeight / totalWeight : finalItems.length > 0 ? 1 : 0;
  if (mealPass.missed.length > 0) {
    feasibilityScore = Math.max(0, feasibilityScore - 0.12 * mealPass.missed.length);
  }

  const mustRejected = rejectedItems.filter((r) => r.item.priority === "must");
  if (mustRejected.length > 0) {
    feasibilityScore = 0;
    infeasibilityReasons.push(
      ...mustRejected.map((r) => `Must-do "${r.item.title}" (${r.item.id}) could not be scheduled: ${r.reason}`),
    );
  }

  if (infeasibilityReasons.length > 0 && feasibilityScore > 0) {
    /** Keep score > 0 only when no must failures; still flag soft violations. */
  }

  return {
    items: finalItems,
    rejectedItems,
    feasibilityScore: Math.min(1, Math.max(0, feasibilityScore)),
    infeasibilityReasons,
  };
};
