import type { ActivityBlock, MovementLeg } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";
import { movementPlanningService } from "../../../services/planning/movementPlanningService";
import { estimateTransportTimeSync } from "../../transport/transportTimeResolver";
import {
  dayWindowMinutes,
  defaultBufferMinutesBetween,
  durationMinutesBetween,
  inferDistanceHintFromTravelMeta,
  plannedGapMinutes,
  sumDeclaredActivityMinutes,
  sumDefaultBufferMinutes,
  sumDeclaredTravelMinutes,
  wallMinutesFromMidnight,
} from "./timelineCalculator";
import type {
  TimelineTravelDistanceHint,
  TimelineValidationResult,
  TimelineWarning,
  TripDayTimeline,
  TripPlanItem,
} from "./timeline.types";
import { buildClusterEfficiencyWarnings } from "../../geo-clustering/clusterTripItems";

const ACTIVE_HOURS_WARN = 8;
const ACTIVE_HOURS_INFEASIBLE = 10;
const MAX_ITEMS_SOFT_WARNING = 10;
const MEAL_FULL_DAY_MINUTES = 8 * 60;

const lunchStart = 11 * 60 + 30;
const lunchEnd = 14 * 60;
const dinnerStart = 17 * 60 + 30;
const dinnerEnd = 20 * 60 + 30;

const legBetween = (legs: readonly MovementLeg[] | undefined, fromId: string, toId: string): MovementLeg | undefined =>
  legs?.find((leg) => leg.fromBlockId === fromId && leg.toBlockId === toId);

const hintFromLeg = (leg: MovementLeg | undefined): TimelineTravelDistanceHint => {
  if (!leg) {
    return "uncertain";
  }
  const travel = Math.max(0, leg.primary.durationMinutes);
  return inferDistanceHintFromTravelMeta(travel, leg.primary.certainty, leg.primary.estimateConfidence);
};

const coordsFromBlock = (block: ActivityBlock): { lat: number; lng: number } | undefined => {
  const lat = block.place?.latitude;
  const lng = block.place?.longitude;
  if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return undefined;
};

const blockDurationMinutes = (block: ActivityBlock): number =>
  Math.max(0, durationMinutesBetween(block.startTime, block.endTime));

export const dayPlanToTripDayTimeline = (day: DayPlan): TripDayTimeline => {
  const sorted = [...day.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const startTime = sorted[0]?.startTime ?? "09:00";
  const endTime = sorted.at(-1)?.endTime ?? "18:00";

  const items: TripPlanItem[] = sorted.map((block, index) => {
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const leg = previous ? legBetween(day.movementLegs, previous.id, block.id) : undefined;
    let travelMinutes = 0;
    let travelDistanceHint: TimelineTravelDistanceHint | undefined;
    let travelEstimateConfidence: TripPlanItem["travelEstimateConfidence"];

    if (index > 0 && previous) {
      if (leg) {
        travelMinutes = Math.max(0, leg.primary.durationMinutes);
        travelDistanceHint = hintFromLeg(leg);
        travelEstimateConfidence = leg.primary.estimateConfidence;
      } else {
        const fromPt = coordsFromBlock(previous);
        const toPt = coordsFromBlock(block);
        if (fromPt && toPt) {
          const resolved = estimateTransportTimeSync({
            from: fromPt,
            to: toPt,
            mode: "walking",
            departureTime: `${day.date}T${previous.endTime}`,
          });
          travelMinutes = resolved.durationMinutes;
          travelDistanceHint = inferDistanceHintFromTravelMeta(travelMinutes, undefined, resolved.confidence);
          travelEstimateConfidence = resolved.confidence;
        } else {
          travelMinutes = 0;
          travelDistanceHint = "uncertain";
        }
      }
    }

    const coords = coordsFromBlock(block);
    return {
      id: block.id,
      title: block.title,
      type: block.type,
      estimatedDurationMinutes: blockDurationMinutes(block),
      travelTimeFromPreviousMinutes: travelMinutes,
      plannedStartTime: block.startTime,
      plannedEndTime: block.endTime,
      travelDistanceHint,
      travelEstimateConfidence,
      latitude: coords?.lat,
      longitude: coords?.lng,
    };
  });

  return {
    date: day.date,
    startTime,
    endTime,
    items,
  };
};

const itemOverlapsWindow = (item: TripPlanItem, windowStart: number, windowEnd: number): boolean => {
  if (!item.plannedStartTime || !item.plannedEndTime) {
    return false;
  }
  const start = wallMinutesFromMidnight(item.plannedStartTime);
  const end = wallMinutesFromMidnight(item.plannedEndTime);
  if (start === null || end === null) {
    return false;
  }
  return start < windowEnd && end > windowStart;
};

const isMealLikeFromTimeline = (item: TripPlanItem): boolean => {
  if (item.type === "meal") {
    return true;
  }
  const hay = `${item.type} ${item.title}`.toLowerCase();
  return hay.includes("lunch") || hay.includes("dinner") || hay.includes("brunch") || hay.includes("meal");
};

export const validateTripDayTimeline = (timeline: TripDayTimeline): TimelineValidationResult => {
  const warnings: TimelineWarning[] = [];
  const window = dayWindowMinutes(timeline.startTime, timeline.endTime);
  const items = timeline.items;

  if (items.length > MAX_ITEMS_SOFT_WARNING) {
    warnings.push({
      type: "too_many_items",
      message: `The day lists ${items.length} items, which is a lot to protect with realistic buffers.`,
      severity: "medium",
    });
  }

  items.forEach((item, index) => {
    if (!Number.isFinite(item.estimatedDurationMinutes) || item.estimatedDurationMinutes <= 0) {
      warnings.push({
        type: "not_enough_buffer",
        message: `Item "${item.title}" is missing a positive estimated duration.`,
        severity: "high",
      });
    }

    if (index > 0) {
      if (!Number.isFinite(item.travelTimeFromPreviousMinutes)) {
        warnings.push({
          type: "travel_time_missing",
          message: `Item "${item.title}" is missing travel time from the previous stop.`,
          severity: "high",
        });
      } else if (item.travelTimeFromPreviousMinutes === 0) {
        const hint = item.travelDistanceHint ?? "uncertain";
        if (hint !== "nearby") {
          warnings.push({
            type: "travel_time_missing",
            message: `Item "${item.title}" declares zero travel from the previous stop while the move does not look immediate.`,
            severity: "medium",
          });
        }
      }
    }
  });

  const totalActivityMinutes = sumDeclaredActivityMinutes(items);
  const totalTravelMinutes = sumDeclaredTravelMinutes(items);
  const totalBufferMinutes = sumDefaultBufferMinutes(items);

  let clockGapsOk = true;
  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1];
    const current = items[i];
    if (!prev || !current) {
      continue;
    }
    const gap = plannedGapMinutes(prev, current);
    if (gap === null) {
      continue;
    }
    const required = current.travelTimeFromPreviousMinutes + defaultBufferMinutesBetween(current.travelDistanceHint);
    if (gap < required) {
      clockGapsOk = false;
      warnings.push({
        type: "not_enough_buffer",
        message: `Clock gap before "${current.title}" is shorter than travel (${current.travelTimeFromPreviousMinutes}m) plus default buffer (${defaultBufferMinutesBetween(current.travelDistanceHint)}m).`,
        severity: gap < required - 10 ? "high" : "medium",
      });
    }
  }

  const scheduledTotal = totalActivityMinutes + totalTravelMinutes + totalBufferMinutes;
  const overloadMinutes = Math.max(0, scheduledTotal - window);

  const activeHours = (totalActivityMinutes + totalTravelMinutes) / 60;
  if (activeHours > ACTIVE_HOURS_INFEASIBLE) {
    warnings.push({
      type: "day_too_long",
      message: `Active time (activities plus travel) is about ${activeHours.toFixed(1)} hours, which exceeds a realistic full day.`,
      severity: "high",
    });
  } else if (activeHours > ACTIVE_HOURS_WARN) {
    warnings.push({
      type: "day_too_long",
      message: `Active time (activities plus travel) is about ${activeHours.toFixed(1)} hours — this day may feel stretched.`,
      severity: "high",
    });
  }

  if (window >= MEAL_FULL_DAY_MINUTES) {
    const sorted = [...items].sort((a, b) => (a.plannedStartTime ?? "").localeCompare(b.plannedStartTime ?? ""));
    const lunchOk = sorted.some((item) => itemOverlapsWindow(item, lunchStart, lunchEnd) && isMealLikeFromTimeline(item));
    const dinnerOk = sorted.some((item) => itemOverlapsWindow(item, dinnerStart, dinnerEnd) && isMealLikeFromTimeline(item));
    if (!lunchOk || !dinnerOk) {
      warnings.push({
        type: "meal_gap_missing",
        message: !lunchOk && !dinnerOk
          ? "This full day does not clearly reserve lunch or dinner windows."
          : !lunchOk
            ? "This full day does not clearly reserve a lunch window."
            : "This full day does not clearly reserve a dinner window.",
        severity: "medium",
      });
    }
  }

  warnings.push(...buildClusterEfficiencyWarnings(items));

  const badDurations = items.some((item) => !Number.isFinite(item.estimatedDurationMinutes) || item.estimatedDurationMinutes <= 0);
  const badTravelMeta = items.some((item, index) => index > 0 && !Number.isFinite(item.travelTimeFromPreviousMinutes));

  const isFeasible =
    overloadMinutes === 0 &&
    activeHours <= ACTIVE_HOURS_INFEASIBLE &&
    !badDurations &&
    !badTravelMeta &&
    clockGapsOk;

  return {
    isFeasible,
    totalActivityMinutes,
    totalTravelMinutes,
    totalBufferMinutes,
    overloadMinutes,
    warnings,
  };
};

const removalScore = (block: ActivityBlock): number => {
  if (block.locked || block.type === "transfer") {
    return 1_000;
  }
  if (block.priority === "must") {
    return 400;
  }
  if (block.priority === "should") {
    return 200;
  }
  return 0;
};

const shortenBlockEnd = (block: ActivityBlock, deltaMinutes: number): ActivityBlock => {
  const end = wallMinutesFromMidnight(block.endTime);
  const start = wallMinutesFromMidnight(block.startTime);
  if (end === null || start === null) {
    return block;
  }
  const nextEnd = Math.max(start + 20, end - deltaMinutes);
  const hours = Math.floor(nextEnd / 60);
  const minutes = nextEnd % 60;
  const endTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return { ...block, endTime };
};

/**
 * Deterministic repair: drop lowest-priority removable blocks, then shorten the longest soft block slightly.
 * Rebuilds movement legs so travel hints stay aligned with blocks.
 */
export const repairDayPlanForTimeline = async (day: DayPlan, result: TimelineValidationResult): Promise<DayPlan> => {
  if (result.isFeasible) {
    return day;
  }

  let workingBlocks = [...day.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  let legs = await movementPlanningService.buildMovementLegs(workingBlocks);
  let workingDay: DayPlan = { ...day, blocks: workingBlocks, movementLegs: legs };
  let validation = validateTripDayTimeline(dayPlanToTripDayTimeline(workingDay));

  let guard = 0;
  while (!validation.isFeasible && guard < 24) {
    guard += 1;
    const removable = workingBlocks.filter((b) => removalScore(b) < 500);
    if (removable.length > 0) {
      const victim = removable.sort((a, b) => removalScore(a) - removalScore(b))[0];
      if (victim) {
        workingBlocks = workingBlocks.filter((b) => b.id !== victim.id);
        legs = await movementPlanningService.buildMovementLegs(workingBlocks);
        workingDay = { ...day, blocks: workingBlocks, movementLegs: legs };
        validation = validateTripDayTimeline(dayPlanToTripDayTimeline(workingDay));
        continue;
      }
    }

    const soft = workingBlocks
      .filter((b) => removalScore(b) < 500 && b.type !== "transfer" && blockDurationMinutes(b) > 35)
      .sort((a, b) => blockDurationMinutes(b) - blockDurationMinutes(a))[0];
    if (!soft) {
      break;
    }
    workingBlocks = workingBlocks.map((b) => (b.id === soft.id ? shortenBlockEnd(b, 15) : b));
    legs = await movementPlanningService.buildMovementLegs(workingBlocks);
    workingDay = { ...day, blocks: workingBlocks, movementLegs: legs };
    validation = validateTripDayTimeline(dayPlanToTripDayTimeline(workingDay));
  }

  return workingDay;
};

export const timelineValidationForDayPlan = (day: DayPlan): TimelineValidationResult =>
  validateTripDayTimeline(dayPlanToTripDayTimeline(day));

export const buildTimelineRegenerationHints = (days: readonly DayPlan[]): string[] => {
  const lines: string[] = [];
  days.forEach((day) => {
    const result = timelineValidationForDayPlan(day);
    if (!result.isFeasible) {
      lines.push(
        `${day.cityLabel} on ${day.date}: overload ${result.overloadMinutes}m vs window; active ${result.totalActivityMinutes}m + travel ${result.totalTravelMinutes}m + buffers ${result.totalBufferMinutes}m. Fix: ${result.warnings
          .map((w) => w.message)
          .slice(0, 4)
          .join(" | ")}`,
      );
    }
  });
  return lines;
};
