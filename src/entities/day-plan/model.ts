import type { ActivityBlock, CostRange, MovementLeg } from "../activity/model";
import type { PlanWarning } from "../warning/model";

export type DayCompletionStatus =
  | "pending"
  | "in_progress"
  | "needs_review"
  | "done"
  | "partially_done"
  | "skipped"
  | "replanned";

export type ValidationStatus = "fresh" | "stale" | "needs_review" | "partial" | "failed";
export type DayAdjustmentState =
  | "as_planned"
  | "late_start"
  | "low_energy"
  | "sick_day"
  | "stay_in_day"
  | "weather_reset"
  | "travel_delay"
  | "early_finish";

export interface DayAdjustment {
  state: DayAdjustmentState;
  note?: string;
  updatedAt: string;
}

export interface DayPlan {
  id: string;
  userId: string;
  tripId: string;
  segmentId: string;
  cityLabel: string;
  countryLabel?: string;
  date: string;
  theme: string;
  blocks: ActivityBlock[];
  movementLegs?: MovementLeg[];
  estimatedCostRange: CostRange;
  validationStatus: ValidationStatus;
  warnings: PlanWarning[];
  completionStatus: DayCompletionStatus;
  adjustment?: DayAdjustment;
  updatedAt: string;
}
