import type { TimelineTravelDistanceHint, TripPlanItem } from "./timeline.types";

/** Parse `HH:mm` to minutes from midnight; invalid → null. */
export const wallMinutesFromMidnight = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

/** Inclusive span of the working window on the same calendar day (handles end after start only). */
export const dayWindowMinutes = (startTime: string, endTime: string): number => {
  const start = wallMinutesFromMidnight(startTime);
  const end = wallMinutesFromMidnight(endTime);
  if (start === null || end === null) {
    return 0;
  }
  if (end < start) {
    return 0;
  }
  return end - start;
};

/** Duration between two wall times on the same day (e.g. block start/end). */
export const durationMinutesBetween = (startTime: string, endTime: string): number => {
  const start = wallMinutesFromMidnight(startTime);
  const end = wallMinutesFromMidnight(endTime);
  if (start === null || end === null) {
    return 0;
  }
  return Math.max(0, end - start);
};

/**
 * Default buffer between consecutive items (on top of declared travel), by distance tier:
 * nearby 10, medium 20, long/uncertain 30+ → 30.
 */
export const defaultBufferMinutesBetween = (hint: TimelineTravelDistanceHint | undefined): number => {
  if (hint === "nearby") {
    return 10;
  }
  if (hint === "medium") {
    return 20;
  }
  return 30;
};

export const inferDistanceHintFromTravelMeta = (
  travelMinutes: number,
  certainty: "live" | "partial" | undefined,
  estimateConfidence?: "high" | "medium" | "low",
): TimelineTravelDistanceHint => {
  if (estimateConfidence === "low") {
    return "uncertain";
  }
  if (certainty === "partial" && travelMinutes <= 8) {
    return "uncertain";
  }
  if (travelMinutes <= 12) {
    return "nearby";
  }
  if (travelMinutes <= 28) {
    return "medium";
  }
  return "long";
};

export const sumDeclaredActivityMinutes = (items: readonly TripPlanItem[]): number =>
  items.reduce((sum, item) => sum + Math.max(0, item.estimatedDurationMinutes), 0);

export const sumDeclaredTravelMinutes = (items: readonly TripPlanItem[]): number =>
  items.reduce((sum, item, index) => sum + (index === 0 ? 0 : Math.max(0, item.travelTimeFromPreviousMinutes)), 0);

/** Sum of default inter-item buffers (rule 3), excluding the first item. */
export const sumDefaultBufferMinutes = (items: readonly TripPlanItem[]): number => {
  if (items.length <= 1) {
    return 0;
  }
  let sum = 0;
  for (let i = 1; i < items.length; i += 1) {
    const current = items[i];
    if (!current) {
      continue;
    }
    sum += defaultBufferMinutesBetween(current.travelDistanceHint);
  }
  return sum;
};

/** Planned clock gap between previous end and current start, when both set. */
export const plannedGapMinutes = (previous: TripPlanItem, current: TripPlanItem): number | null => {
  if (!previous.plannedEndTime || !current.plannedStartTime) {
    return null;
  }
  return durationMinutesBetween(previous.plannedEndTime, current.plannedStartTime);
};
