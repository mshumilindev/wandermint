import type { Trip, TripBudget, TripPlanningMode, TripPreferences, TripSegment } from "../../entities/trip/model";
import type { UserPreferences } from "../../entities/user/model";
import type { TripReview } from "../trip-review/tripReview.types";

/**
 * Account-wide defaults (Firestore `userPreferences`).
 * Must not be overwritten from a single trip without explicit user confirmation.
 */
export type MemoryUserPreferences = {
  cuisineInterests: string[];
  dislikedCategories: string[];
  travelPacePreference: UserPreferences["preferredPace"];
  walkingTolerance: UserPreferences["walkingTolerance"];
  /** Reserved for explicit accessibility fields when added to the product schema. */
  accessibilityNotes: string | null;
  locale: string;
  currency: string;
  homeCity: string;
  rightNowExploreSpeed?: UserPreferences["rightNowExploreSpeed"];
};

/**
 * Aggregated completion metrics only (Firestore travel behavior profile).
 * Keep separate from {@link MemoryUserPreferences} — never blend “what user likes” with “what the app inferred from past trips”.
 */
export type MemoryTravelBehaviorMetrics = {
  userId: string;
  totalTrips: number;
  totalPlannedItems: number;
  totalCompletedItems: number;
  totalSkippedItems: number;
  averageCompletionRate: number;
  averageSkipRate: number;
  averageDelayMinutes: number;
  preferredPace: "fast" | "balanced" | "slow";
  planningBias: "underplanned" | "realistic" | "overplanned";
  lastUpdatedAt: string;
};

/** Per-trip post-trip analysis payload (subset of stored review doc). */
export type MemoryTripReviewSummary = TripReview;

/**
 * Hard logistics for the itinerary being generated (dates, money, geography, anchors).
 * Not “preferences” — structural constraints only.
 */
export type MemoryTripConstraints = {
  budget: TripBudget;
  dateRange: { start: string; end: string };
  destination: string;
  tripSegments: TripSegment[];
  planningMode: TripPlanningMode;
  flightInfo: Trip["flightInfo"];
  hotelInfo: Trip["hotelInfo"];
  anchorEvents: NonNullable<Trip["anchorEvents"]>;
};

/**
 * Wizard-only selections for the *current* design session.
 * Never persisted as global user defaults from this path (Rule 2–3).
 */
export type MemoryTemporaryTripPreferences = {
  preferences: TripPreferences;
  executionProfile: NonNullable<Trip["executionProfile"]>;
};

/** All memory domains passed into trip generation as separate slices (Rule 5). */
export type MemoryLayers = {
  globalUserPreferences: MemoryUserPreferences | null;
  travelBehaviorMetrics: MemoryTravelBehaviorMetrics | null;
  tripReviewSummary: MemoryTripReviewSummary | null;
  tripConstraints: MemoryTripConstraints;
  temporaryTripPreferences: MemoryTemporaryTripPreferences;
};

export type PersistedMemoryBundle = {
  globalUserPreferences: MemoryUserPreferences | null;
  travelBehaviorMetrics: MemoryTravelBehaviorMetrics | null;
  tripReviewSummary: MemoryTripReviewSummary | null;
};

/**
 * Minimal `TripDraft` slice for memory extraction without importing `tripGenerationService` (cycle-safe).
 */
export type TripDraftForMemorySlice = {
  userId: string;
  budget: TripBudget;
  dateRange: { start: string; end: string };
  destination: string;
  tripSegments: TripSegment[];
  planningMode: TripPlanningMode;
  flightInfo: Trip["flightInfo"];
  hotelInfo: Trip["hotelInfo"];
  anchorEvents: NonNullable<Trip["anchorEvents"]>;
  preferences: TripPreferences;
  executionProfile: NonNullable<Trip["executionProfile"]>;
  userPreferences?: UserPreferences | null;
};
