import type { TripPlanItem } from "../decisionEngine.types";
import {
  compareRemoval,
  isoToMs,
  minutesBetweenUtc,
  reorderForWeatherRisk,
  sortByPlannedStart,
  totalRequiredMinutes,
  wallTimeOnSameLocalDayMs,
} from "../decisionEngine.utils";
import { resolveOpeningHoursFromLabel } from "../../places/opening-hours/openingHoursResolver";
import { validatePlanWindowAgainstOpeningHours } from "../../places/opening-hours/openingHoursValidator";
import { sortReplacementCandidatesByCluster } from "../../geo-clustering/clusterTripItems";
import { createClientId } from "../../../shared/lib/id";
import type { ReplanInput, ReplanResult, ReplanTripOptions } from "./replanTrip.types";

const MS_PER_MINUTE = 60_000;

const clone = (item: TripPlanItem): TripPlanItem => ({ ...item });

const partition = (state: ReplanInput["executionState"]) => {
  const done = new Set(state.completedItemIds);
  const skippedIdSet = new Set(state.skippedItemIds);
  const completed = sortByPlannedStart(state.items.filter((i) => done.has(i.id)));
  const skipped = sortByPlannedStart(state.items.filter((i) => skippedIdSet.has(i.id)));
  const active = sortByPlannedStart(
    state.items.filter((i) => !done.has(i.id) && !skippedIdSet.has(i.id) && i.status === "planned"),
  );
  return { completed, skipped, active };
};

const availableMinutes = (state: ReplanInput["executionState"]): number => {
  const nowMs = isoToMs(state.now);
  const endMs = wallTimeOnSameLocalDayMs(state.now, state.dayEndTime);
  let minutes = minutesBetweenUtc(nowMs, endMs);
  if (state.energyLevel === "low") {
    minutes = Math.floor(minutes * 0.75);
  }
  return minutes;
};

const pruneToWindow = (
  active: TripPlanItem[],
  state: ReplanInput["executionState"],
): { kept: TripPlanItem[]; removed: TripPlanItem[] } => {
  const weatherRisk = state.weatherRisk ?? "none";
  let working = active.map(clone);
  const removed: TripPlanItem[] = [];
  let available = availableMinutes(state);
  let required = totalRequiredMinutes(working);

  const pool = (): TripPlanItem[] =>
    [...working].filter((i) => i.priority !== "must").sort((a, b) => compareRemoval(a, b, weatherRisk));

  let removable = pool();
  while (required > available && removable.length > 0) {
    const victim = removable.shift()!;
    removed.push(victim);
    working = working.filter((i) => i.id !== victim.id);
    required = totalRequiredMinutes(working);
    removable = pool();
  }

  return { kept: working, removed };
};

const shortenNonCriticalDurations = (active: TripPlanItem[]): TripPlanItem[] =>
  active.map((item) =>
    item.priority === "must" || item.priority === "high"
      ? clone(item)
      : {
          ...item,
          estimatedDurationMinutes: Math.max(15, Math.round(item.estimatedDurationMinutes * 0.85)),
        },
  );

const findClosedTarget = (input: ReplanInput, active: TripPlanItem[]): TripPlanItem | undefined => {
  if (input.affectedItemId) {
    return active.find((i) => i.id === input.affectedItemId);
  }
  const nowMs = isoToMs(input.executionState.now);
  return active.find((item) => {
    const start = isoToMs(item.plannedStartTime);
    const end = isoToMs(item.plannedEndTime);
    return nowMs >= start && nowMs < end;
  });
};

const deterministicClosedReplacement = (closed: TripPlanItem): TripPlanItem => ({
  ...closed,
  id: createClientId("replan_item"),
  title: `${closed.title} (nearby alternative)`,
  location: {
    ...closed.location,
    lat: closed.location.lat + 0.002,
    lng: closed.location.lng + 0.002,
  },
  plannedStartTime: closed.plannedStartTime,
  plannedEndTime: closed.plannedEndTime,
  status: "planned",
});

const defaultOpeningHoursTz = (closed: TripPlanItem, candidate: TripPlanItem): string => {
  const fromCandidate = candidate.openingHoursTimezone?.trim();
  if (fromCandidate && fromCandidate.length > 0) {
    return fromCandidate;
  }
  const fromClosed = closed.openingHoursTimezone?.trim();
  if (fromClosed && fromClosed.length > 0) {
    return fromClosed;
  }
  return "UTC";
};

const cloneReplacementFromCandidate = (closed: TripPlanItem, candidate: TripPlanItem): TripPlanItem => ({
  ...candidate,
  id: createClientId("replan_item"),
  plannedStartTime: closed.plannedStartTime,
  plannedEndTime: closed.plannedEndTime,
  estimatedDurationMinutes: closed.estimatedDurationMinutes,
  travelTimeFromPreviousMinutes: closed.travelTimeFromPreviousMinutes,
  priority: closed.priority,
  type: closed.type,
  status: "planned",
  locationResolutionStatus: candidate.locationResolutionStatus ?? closed.locationResolutionStatus,
});

/**
 * Picks a replacement that is deterministically open for the closed item's window, else unknown-hours, before any AI.
 */
const pickReplacementFromCandidatePool = (closed: TripPlanItem, pool: TripPlanItem[]): TripPlanItem | null => {
  if (pool.length === 0) {
    return null;
  }

  const seen = new Set<string>();
  const uniquePool = pool.filter((c) => {
    if (seen.has(c.id)) {
      return false;
    }
    seen.add(c.id);
    return true;
  });
  const anchors = [closed, ...uniquePool];
  const orderedPool = sortReplacementCandidatesByCluster(closed, uniquePool, anchors);

  const tryStatus = (wanted: "open" | "unknown"): TripPlanItem | null => {
    for (const candidate of orderedPool) {
      if (candidate.id === closed.id) {
        continue;
      }
      const tz = defaultOpeningHoursTz(closed, candidate);
      const hours = resolveOpeningHoursFromLabel(candidate.openingHoursLabel, tz);
      const result = validatePlanWindowAgainstOpeningHours(hours, closed.plannedStartTime, closed.plannedEndTime);
      if (result.status === wanted) {
        return cloneReplacementFromCandidate(closed, candidate);
      }
    }
    return null;
  };

  return tryStatus("open") ?? tryStatus("unknown");
};

const reschedulePlanned = (
  completed: TripPlanItem[],
  skipped: TripPlanItem[],
  planned: TripPlanItem[],
  state: ReplanInput["executionState"],
): TripPlanItem[] => {
  if (planned.length === 0) {
    return sortByPlannedStart([...completed.map(clone), ...skipped.map(clone)]);
  }

  let cursorMs = isoToMs(state.now);
  const lastDone = completed.at(-1);
  if (lastDone) {
    cursorMs = Math.max(cursorMs, isoToMs(lastDone.plannedEndTime));
  }

  const nextPlanned: TripPlanItem[] = [];
  planned.forEach((item) => {
    cursorMs += item.travelTimeFromPreviousMinutes * MS_PER_MINUTE;
    const startIso = new Date(cursorMs).toISOString();
    const endMs = cursorMs + item.estimatedDurationMinutes * MS_PER_MINUTE;
    const endIso = new Date(endMs).toISOString();
    nextPlanned.push({
      ...item,
      plannedStartTime: startIso,
      plannedEndTime: endIso,
    });
    cursorMs = endMs;
  });

  return sortByPlannedStart([...completed.map(clone), ...skipped.map(clone), ...nextPlanned]);
};

const detectMoved = (before: Map<string, TripPlanItem>, after: TripPlanItem[]): TripPlanItem[] =>
  after.filter((item) => {
    const prev = before.get(item.id);
    if (!prev) {
      return true;
    }
    return (
      prev.plannedStartTime !== item.plannedStartTime ||
      prev.plannedEndTime !== item.plannedEndTime ||
      prev.estimatedDurationMinutes !== item.estimatedDurationMinutes
    );
  });

const buildUserMessage = (input: ReplanInput, removedCount: number, replaced: boolean, usedAi: boolean): string => {
  const reason = input.reason;
  if (reason === "place_closed" && replaced) {
    return usedAi
      ? "That stop looks closed. We swapped in a suggested alternative and tightened the rest of the day."
      : "That stop looks closed. We inserted a nearby same-category placeholder and tightened the rest of the day.";
  }
  if (reason === "user_energy_low") {
    return removedCount > 0
      ? "Low energy mode: we shortened lighter stops and removed some lower-priority items so the day stays realistic."
      : "Low energy mode: we shortened lighter stops to give you more breathing room.";
  }
  if (reason === "weather_changed") {
    return "Weather shifted: we reordered toward safer indoor timing and trimmed optional outdoor gaps where needed.";
  }
  if (reason === "user_is_late") {
    return removedCount > 0
      ? "Running late: we dropped lower-priority items and re-slotted what remains so the plan still fits today."
      : "Running late: we re-slotted the remaining stops from now so the plan still fits today.";
  }
  if (reason === "user_skipped_item") {
    return removedCount > 0
      ? "After that skip, we trimmed lower-priority items and re-slotted the rest to protect must-sees."
      : "After that skip, we re-slotted the remaining stops from now.";
  }
  return "We updated the rest of today to keep the plan feasible.";
};

const inferConfidence = (
  removedCount: number,
  replacedClosed: boolean,
  usedAi: boolean,
  stillOverload: boolean,
  weatherReordered: boolean,
): ReplanResult["confidence"] => {
  if (stillOverload) {
    return "low";
  }
  if (usedAi) {
    return "medium";
  }
  if (replacedClosed) {
    return "medium";
  }
  if (removedCount > 0 || weatherReordered) {
    return "medium";
  }
  return "high";
};

/**
 * Live replan: deterministic pruning, optional qualitative replacement for `place_closed`, then time reslotting.
 */
export const replanTrip = async (input: ReplanInput, options?: ReplanTripOptions): Promise<ReplanResult> => {
  const { completed, skipped, active } = partition(input.executionState);
  const beforeMap = new Map(input.executionState.items.map((i) => [i.id, clone(i)]));

  let working = active.map(clone);
  const removed: TripPlanItem[] = [];
  let usedAi = false;
  let replacedClosed = false;
  let weatherReordered = false;

  if (input.reason === "place_closed") {
    const closed = findClosedTarget(input, working);
    if (closed) {
      working = working.filter((i) => i.id !== closed.id);
      removed.push(closed);
      let replacement: TripPlanItem | null = pickReplacementFromCandidatePool(closed, options?.replacementCandidates ?? []);
      if (!replacement && options?.suggestReplacement) {
        replacement = await options.suggestReplacement(closed, input);
        usedAi = Boolean(replacement);
      }
      const nextItem = replacement ?? deterministicClosedReplacement(closed);
      working = sortByPlannedStart([...working, nextItem]);
      replacedClosed = true;
    }
  }

  if (input.reason === "weather_changed" && (input.executionState.weatherRisk ?? "none") === "high") {
    working = reorderForWeatherRisk(working, "high");
    weatherReordered = true;
  }

  if (input.reason === "user_energy_low") {
    working = shortenNonCriticalDurations(working);
  }

  const pruned = pruneToWindow(working, input.executionState);
  working = pruned.kept;
  removed.push(...pruned.removed);

  const stillOverload = totalRequiredMinutes(working) > availableMinutes(input.executionState);
  const updatedItems = reschedulePlanned(completed, skipped, working, input.executionState);
  const movedItems = detectMoved(beforeMap, updatedItems);

  return {
    updatedItems,
    removedItems: removed,
    movedItems,
    messageToUser: buildUserMessage(input, removed.length, replacedClosed, usedAi),
    confidence: inferConfidence(removed.length, replacedClosed, usedAi, stillOverload, weatherReordered),
  };
};
