export type AchievementCategory = "travel" | "exploration" | "consistency" | "challenge" | "social";

export type AchievementEvaluationSignal =
  | "completedTrip"
  | "completedItem"
  | "updatedBucketList"
  | "updatedBehaviorProfile";

export type AchievementCondition =
  | { type: "visit_count"; category?: string; target: number }
  | { type: "countries_visited"; target: number }
  | { type: "cities_visited"; target: number }
  | { type: "bucket_items_completed"; target: number }
  /** Distinct bucket list rows (deduped by entity / fuzzy merge key), visited or not. */
  | { type: "bucket_places_collected"; target: number }
  | { type: "unique_categories"; target: number }
  | { type: "trips_completed"; target: number }
  | { type: "best_trip_completion_rate"; threshold: number }
  | { type: "trips_above_completion_rate_count"; threshold: number; minTrips: number }
  | { type: "food_related_visits"; target: number }
  | {
      type: "efficient_completed_trip";
      minCompletionRate: number;
      maxAverageStartDelayMinutes: number;
      maxTravelDelayDays: number;
    };

export type Achievement = {
  id: string;
  key: string;
  title: string;
  description: string;
  category: AchievementCategory;
  icon?: string;
  /** Which lifecycle signals require re-evaluating this achievement (avoids full-catalog runs). */
  evaluationSignals: readonly AchievementEvaluationSignal[];
  conditions: AchievementCondition[];
};

export type AchievementProgress = {
  userId: string;
  achievementKey: string;
  progress: number;
  target: number;
  unlocked: boolean;
  unlockedAt?: string;
};

/** What changed since the last evaluation — used to pick a subset of achievements and metric loads. */
export type AchievementEvaluationContext = {
  /** Re-run the entire catalog (full metric load). */
  evaluateAll?: boolean;
  completedTrip?: { tripId: string };
  updatedBehaviorProfile?: boolean;
  updatedBucketList?: boolean;
  completedItem?: { tripId: string; dayId: string; blockId: string };
};

/** Returned when an achievement becomes unlocked for the first time (for UI toasts). */
export type AchievementUnlockNotice = Pick<Achievement, "key" | "title" | "description" | "category" | "icon">;
