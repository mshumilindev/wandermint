import type { TripPlanItem } from "../trip-execution/decisionEngine.types";

export type CompletedTrip = {
  tripId: string;
  userId: string;
  plannedItems: TripPlanItem[];
  completedItemIds: string[];
  skippedItemIds: string[];
  actualStartTimes?: Record<string, string>;
  actualEndTimes?: Record<string, string>;
};

export type TripReview = {
  completionRate: number;
  skipRate: number;
  averageDelayMinutes: number;
  mostSkippedCategories: string[];
  overloadedDays: string[];
  insights: string[];
};
