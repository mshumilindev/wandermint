import type { TripPlanItem } from "../trip-execution/decisionEngine.types";

export type TimelineProgressStatus = "not_started" | "on_track" | "delayed" | "ahead" | "finished";

export type TimelineProgress = {
  completedCount: number;
  skippedCount: number;
  remainingCount: number;
  currentItem?: TripPlanItem;
  nextItem?: TripPlanItem;
  delayMinutes: number;
  status: TimelineProgressStatus;
};
