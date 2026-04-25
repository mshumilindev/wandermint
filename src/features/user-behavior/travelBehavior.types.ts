import { z } from "zod";

export type TravelBehaviorSelectedPace = "fast" | "balanced" | "slow";

export type TravelBehaviorPlanningBias = "underplanned" | "realistic" | "overplanned";

export interface TravelBehaviorProfile {
  userId: string;
  totalTrips: number;
  totalPlannedItems: number;
  totalCompletedItems: number;
  totalSkippedItems: number;
  averageCompletionRate: number;
  averageSkipRate: number;
  averageDelayMinutes: number;
  preferredPace: TravelBehaviorSelectedPace;
  planningBias: TravelBehaviorPlanningBias;
  lastUpdatedAt: string;
}

export interface CompletedTripSummary {
  plannedItemsCount: number;
  completedItemsCount: number;
  skippedItemsCount: number;
  averageDelayMinutes: number;
  selectedPace: TravelBehaviorSelectedPace;
}

export const travelBehaviorProfileSchema = z.object({
  userId: z.string(),
  totalTrips: z.number().int().nonnegative(),
  totalPlannedItems: z.number().int().nonnegative(),
  totalCompletedItems: z.number().int().nonnegative(),
  totalSkippedItems: z.number().int().nonnegative(),
  averageCompletionRate: z.number(),
  averageSkipRate: z.number(),
  averageDelayMinutes: z.number(),
  preferredPace: z.enum(["fast", "balanced", "slow"]),
  planningBias: z.enum(["underplanned", "realistic", "overplanned"]),
  lastUpdatedAt: z.string(),
});
