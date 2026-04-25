import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";
import { formatDateInTimeZone, resolvePlanTimezone } from "./planTimeUtils";

export type DayVsToday = "today" | "past" | "future";

export type TripTimelinePhase = "upcoming" | "in_progress" | "past";

/**
 * Compare the plan day’s calendar date with “today” in that day’s segment plan timezone.
 */
export const classifyDayVsToday = (day: DayPlan, trip: Trip | null, now: Date): DayVsToday => {
  const tz = resolvePlanTimezone(trip, day.segmentId);
  const today = formatDateInTimeZone(now, tz);
  if (day.date === today) {
    return "today";
  }
  if (day.date < today) {
    return "past";
  }
  return "future";
};

/**
 * Whether the trip’s itinerary window is entirely before, after, or overlapping “today” in local segment dates.
 */
export const getTripTimelinePhase = (days: DayPlan[], trip: Trip | null, now: Date): TripTimelinePhase => {
  if (days.length === 0) {
    return "past";
  }
  const states = days.map((d) => classifyDayVsToday(d, trip, now));
  if (states.some((s) => s === "today")) {
    return "in_progress";
  }
  if (states.every((s) => s === "future")) {
    return "upcoming";
  }
  if (states.every((s) => s === "past")) {
    return "past";
  }
  return "in_progress";
};

/** First day that is “today” in its segment timezone, or null. */
export const findCalendarTodayDayId = (days: DayPlan[], trip: Trip | null, now: Date): string | null => {
  for (const d of days) {
    if (classifyDayVsToday(d, trip, now) === "today") {
      return d.id;
    }
  }
  return null;
};
