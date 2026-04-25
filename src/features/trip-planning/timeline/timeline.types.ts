/** Travel tier used to pick default inter-item buffer minutes (deterministic). */
export type TimelineTravelDistanceHint = "nearby" | "medium" | "long" | "uncertain";

/**
 * Minimal plan row for timeline math (aligned with trip execution “plan item” fields used for duration + travel).
 */
export type TripPlanItem = {
  id: string;
  title: string;
  type: string;
  estimatedDurationMinutes: number;
  /** First item should be 0; each following item must include travel from the previous stop. */
  travelTimeFromPreviousMinutes: number;
  /** Optional wall times on `TripDayTimeline.date` for gap checks. */
  plannedStartTime?: string;
  plannedEndTime?: string;
  travelDistanceHint?: TimelineTravelDistanceHint;
  /** Mirrors transport resolver confidence for this leg when known. */
  travelEstimateConfidence?: "high" | "medium" | "low";
  /** Populated from day-plan place coordinates for geographic cluster analysis. */
  latitude?: number;
  longitude?: number;
};

export type TripDayTimeline = {
  date: string;
  startTime: string;
  endTime: string;
  items: TripPlanItem[];
};

export type TimelineWarningType =
  | "too_many_items"
  | "not_enough_buffer"
  | "travel_time_missing"
  | "day_too_long"
  | "meal_gap_missing"
  | "cluster_efficiency"
  | "cluster_long_jump";

export type TimelineWarningSeverity = "low" | "medium" | "high";

export type TimelineWarning = {
  type: TimelineWarningType;
  message: string;
  severity: TimelineWarningSeverity;
};

export type TimelineValidationResult = {
  isFeasible: boolean;
  totalActivityMinutes: number;
  totalTravelMinutes: number;
  totalBufferMinutes: number;
  overloadMinutes: number;
  warnings: TimelineWarning[];
};
