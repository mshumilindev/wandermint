import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { TimelineValidationResult } from "../trip-planning/timeline/timeline.types";

export type ExportItineraryOptions = {
  tripId: string;
  tripTitle: string;
  /** IANA timezone used for wall times on each block (e.g. segment city TZ). */
  defaultTimezone: string;
  /** Override per day; defaults to {@link ExportItineraryOptions.defaultTimezone}. */
  timezoneForDay?: (day: DayPlan) => string;
  /**
   * When the timeline validator reports an infeasible day, export is blocked unless this is true.
   * If true, the calendar file is still produced and each affected event DESCRIPTION is prefixed
   * with an explicit feasibility warning (Rule 5).
   */
  allowInfeasibleExportWithWarning?: boolean;
  /** Optional resolver when booking links are not on {@link ActivityBlock.place}. */
  getBookingUrl?: (block: ActivityBlock) => string | undefined;
};

export type ExportDayTimelineCheck = {
  dayPlan: DayPlan;
  validation: TimelineValidationResult;
};

export type ExportItinerarySuccess = {
  ok: true;
  ics: string;
  suggestedFilename: string;
  dayChecks: ExportDayTimelineCheck[];
  /** True when at least one day was infeasible and export used {@link ExportItineraryOptions.allowInfeasibleExportWithWarning}. */
  exportedWithInfeasibleWarning: boolean;
};

export type ExportItineraryFailure = {
  ok: false;
  code: "infeasible_timeline";
  message: string;
  dayChecks: ExportDayTimelineCheck[];
};

export type ExportItineraryResult = ExportItinerarySuccess | ExportItineraryFailure;
