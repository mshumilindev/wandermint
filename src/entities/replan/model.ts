import type { ActivityAlternative, CostRange, PlaceSnapshot } from "../activity/model";

export type ReplanReason =
  | "unfinished_day"
  | "weather_change"
  | "price_change"
  | "late_start"
  | "user_request";

export type ReplanActionType =
  | "move_activity"
  | "remove_activity"
  | "replace_activity"
  | "compress_day";

export interface ReplanAction {
  id: string;
  type: ReplanActionType;
  blockId?: string;
  fromDayId?: string;
  toDayId?: string;
  targetStartTime?: string;
  targetEndTime?: string;
  deleteOriginal?: boolean;
  replacementTitle?: string;
  replacementDescription?: string;
  replacementPlace?: PlaceSnapshot;
  replacementEstimatedCost?: CostRange;
  replacementSourceSnapshots?: PlaceSnapshot[];
  replacementAlternatives?: ActivityAlternative[];
  rationale: string;
}

export interface ReplanProposal {
  id: string;
  userId: string;
  tripId: string;
  sourceDayId?: string;
  createdAt: string;
  reason: ReplanReason;
  summary: string;
  actions: ReplanAction[];
}
