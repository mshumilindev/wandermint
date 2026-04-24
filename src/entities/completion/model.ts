import type { ActivityCompletionStatus } from "../activity/model";
import type { DayCompletionStatus } from "../day-plan/model";
import type { TripCompletionStatus } from "../trip/model";

export interface CompletionHistoryItem {
  id: string;
  userId: string;
  tripId: string;
  dayId?: string;
  blockId?: string;
  previousStatus: ActivityCompletionStatus | DayCompletionStatus | TripCompletionStatus;
  nextStatus: ActivityCompletionStatus | DayCompletionStatus | TripCompletionStatus;
  reason?: string;
  createdAt: string;
}
