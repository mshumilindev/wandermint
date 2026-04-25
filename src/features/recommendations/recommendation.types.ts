import type { EntityReliabilityMap } from "../data-quality/sourceReliability.types";
import type { MemoryTripConstraints } from "../memory/memory.types";
import type { PlanSlotOpeningHoursCheck } from "../places/opening-hours/openingHours.types";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import type { TravelBehaviorProfile } from "../user-behavior/travelBehavior.types";
import type { TravelTasteProfile } from "../user-taste/travelTaste.types";

export type RankedRecommendationConfidence = "high" | "medium" | "low";

export type RankedRecommendation = {
  item: TripPlanItem;
  score: number;
  reasons: string[];
  penalties: string[];
  confidence: RankedRecommendationConfidence;
};

/** Midpoint spend for this stop in `currency` (trip budget currency when possible). */
export type RecommendationBudgetEstimate = {
  estimatedSpendMid: number;
  currency: string;
};

/**
 * One generatable / selectable stop. AI (or providers) may propose these; {@link rankRecommendations}
 * scores and sorts them deterministically.
 */
export type RecommendationCandidate = {
  item: TripPlanItem;
  /** Bucket for taste + category-overload (e.g. food, museum). */
  category?: string;
  reliability?: EntityReliabilityMap | null;
  /** Deterministic opening-hours evaluation for the planned wall-time window. */
  openingHoursCheck?: PlanSlotOpeningHoursCheck | null;
  budgetEstimate?: RecommendationBudgetEstimate | null;
};

export type RecommendationMobility = "low" | "medium" | "high";

export type RecommendationClusteringContext = {
  /** Prior stop or centroid — boosts nearby candidates. */
  referenceLat?: number;
  referenceLng?: number;
  /** Normalized tokens (caller may parse from must-see notes). */
  mustSeeTerms?: string[];
  /** Lowercased notes line; split when `mustSeeTerms` omitted. */
  mustSeeNotes?: string;
  /** Same-category picks already committed for this day/slot sequence. */
  existingCategoryCounts?: Record<string, number>;
};

export type RecommendationRankingInput = {
  candidates: RecommendationCandidate[];
  tripConstraints: MemoryTripConstraints;
  userTasteProfile: TravelTasteProfile | null;
  behaviorProfile: TravelBehaviorProfile | null;
  clustering?: RecommendationClusteringContext | null;
  /** Informs “excessive travel” thresholds (default medium). */
  mobilityTolerance?: RecommendationMobility;
  nowMs?: number;
};
