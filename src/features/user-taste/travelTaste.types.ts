import { z } from "zod";

/**
 * Learned preference surface separate from travel-behavior metrics (pace, completion rates).
 * Values are bounded; confidence gates how strongly generation should lean on them.
 */
export type TravelTasteProfile = {
  userId: string;
  categoryAffinity: Record<string, number>;
  cuisineAffinity: Record<string, number>;
  experienceAffinity: Record<string, number>;
  dislikedPatterns: string[];
  favoritePatterns: string[];
  confidence: number;
  updatedAt: string;
};

/** Raw counters gathered from Firestore before merging into a profile (no inference here). */
export type TasteRawSignals = {
  completedCategoryCounts: Record<string, number>;
  skippedCategoryCounts: Record<string, number>;
  cuisinePositive: Record<string, number>;
  cuisineNegative: Record<string, number>;
  experiencePositive: Record<string, number>;
  experienceNegative: Record<string, number>;
  savedPlaceCategoryBoosts: Record<string, number>;
  removedOrAvoidCategoryHits: Record<string, number>;
  searchQueryCounts: Record<string, number>;
  highlyRatedCategoryHits: Record<string, number>;
  dislikedTypeHits: Record<string, number>;
  /** Trips that contributed day-plan signals (used to damp single-trip dominance). */
  contributingTripIds: string[];
  totalScoringEvents: number;
};

const affinityMapSchema = z.record(z.string(), z.number());

export const travelTasteProfileSchema = z.object({
  userId: z.string(),
  categoryAffinity: affinityMapSchema,
  cuisineAffinity: affinityMapSchema,
  experienceAffinity: affinityMapSchema,
  dislikedPatterns: z.array(z.string()),
  favoritePatterns: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  updatedAt: z.string(),
});
