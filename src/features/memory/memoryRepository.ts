import { collection, getDocs, query, where } from "firebase/firestore";
import type { UserPreferences } from "../../entities/user/model";
import type { TravelBehaviorProfile } from "../user-behavior/travelBehavior.types";
import { privacySettingsRepository } from "../privacy/privacySettingsRepository";
import { shouldPersistTravelBehaviorProfile, shouldPersistTripReview } from "../privacy/privacyActions";
import { travelBehaviorRepository } from "../user-behavior/travelBehaviorRepository";
import { userPreferencesRepository } from "../../services/firebase/repositories/userPreferencesRepository";
import { tripReviewsRepository } from "../../services/firebase/repositories/tripReviewsRepository";
import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import type {
  MemoryLayers,
  MemoryTemporaryTripPreferences,
  MemoryTripConstraints,
  MemoryTravelBehaviorMetrics,
  MemoryTripReviewSummary,
  MemoryUserPreferences,
  PersistedMemoryBundle,
  TripDraftForMemorySlice,
} from "./memory.types";

export type { MemoryLayers, PersistedMemoryBundle } from "./memory.types";

export const mapUserPreferencesToMemory = (prefs: UserPreferences | null | undefined): MemoryUserPreferences | null => {
  if (!prefs) {
    return null;
  }
  return {
    cuisineInterests: [...prefs.foodInterests],
    dislikedCategories: [...prefs.avoids],
    travelPacePreference: prefs.preferredPace,
    walkingTolerance: prefs.walkingTolerance,
    accessibilityNotes: null,
    locale: prefs.locale,
    currency: prefs.currency,
    homeCity: prefs.homeCity,
    rightNowExploreSpeed: prefs.rightNowExploreSpeed,
  };
};

export const mapTravelBehaviorProfileToMetrics = (profile: TravelBehaviorProfile | null | undefined): MemoryTravelBehaviorMetrics | null => {
  if (!profile) {
    return null;
  }
  return {
    userId: profile.userId,
    totalTrips: profile.totalTrips,
    totalPlannedItems: profile.totalPlannedItems,
    totalCompletedItems: profile.totalCompletedItems,
    totalSkippedItems: profile.totalSkippedItems,
    averageCompletionRate: profile.averageCompletionRate,
    averageSkipRate: profile.averageSkipRate,
    averageDelayMinutes: profile.averageDelayMinutes,
    preferredPace: profile.preferredPace,
    planningBias: profile.planningBias,
    lastUpdatedAt: profile.lastUpdatedAt,
  };
};

/** Rehydrates metrics into the existing profile type for legacy travel-behavior helpers. */
export const memoryMetricsToTravelBehaviorProfile = (m: MemoryTravelBehaviorMetrics): TravelBehaviorProfile => ({
  userId: m.userId,
  totalTrips: m.totalTrips,
  totalPlannedItems: m.totalPlannedItems,
  totalCompletedItems: m.totalCompletedItems,
  totalSkippedItems: m.totalSkippedItems,
  averageCompletionRate: m.averageCompletionRate,
  averageSkipRate: m.averageSkipRate,
  averageDelayMinutes: m.averageDelayMinutes,
  preferredPace: m.preferredPace,
  planningBias: m.planningBias,
  lastUpdatedAt: m.lastUpdatedAt,
});

export const extractTripConstraintsFromDraft = (draft: TripDraftForMemorySlice): MemoryTripConstraints => ({
  budget: draft.budget,
  dateRange: draft.dateRange,
  destination: draft.destination,
  tripSegments: draft.tripSegments,
  planningMode: draft.planningMode,
  flightInfo: draft.flightInfo,
  hotelInfo: draft.hotelInfo,
  anchorEvents: draft.anchorEvents,
});

export const extractTemporaryTripPreferencesFromDraft = (draft: TripDraftForMemorySlice): MemoryTemporaryTripPreferences => ({
  preferences: draft.preferences,
  executionProfile: draft.executionProfile,
});

const loadLatestTripReviewSummary = async (userId: string): Promise<MemoryTripReviewSummary | null> => {
  if (!userId.trim()) {
    return null;
  }
  const col = collection(firestoreDb, firestoreCollections.tripReviews);
  const snap = await getDocs(query(col, where("userId", "==", userId)));
  const docs = snap.docs
    .map((d) => tripReviewsRepository.parseTripReviewDocument(d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = docs[0];
  return latest ? latest.review : null;
};

/**
 * Loads persisted global preferences, optional behavior metrics, and optional latest trip review.
 * Behavior metrics are returned only when consent allows learning; trip reviews only when post-trip analysis is allowed.
 */
export const loadPersistedMemoryForTripPlanning = async (userId: string): Promise<PersistedMemoryBundle> => {
  if (!userId.trim()) {
    return { globalUserPreferences: null, travelBehaviorMetrics: null, tripReviewSummary: null };
  }

  const privacy = await privacySettingsRepository.getPrivacySettings(userId).catch(() => null);

  const globalUserPreferences = mapUserPreferencesToMemory(await userPreferencesRepository.getPreferences(userId).catch(() => null));

  let travelBehaviorMetrics: MemoryTravelBehaviorMetrics | null = null;
  if (shouldPersistTravelBehaviorProfile(privacy)) {
    travelBehaviorMetrics = mapTravelBehaviorProfileToMetrics(await travelBehaviorRepository.getProfile(userId).catch(() => null));
  }

  let tripReviewSummary: MemoryTripReviewSummary | null = null;
  if (shouldPersistTripReview(privacy)) {
    tripReviewSummary = await loadLatestTripReviewSummary(userId).catch(() => null);
  }

  return { globalUserPreferences, travelBehaviorMetrics, tripReviewSummary };
};

export const buildMemoryLayersFromTripDraft = (draft: TripDraftForMemorySlice, persisted: PersistedMemoryBundle): MemoryLayers => ({
  globalUserPreferences: persisted.globalUserPreferences ?? mapUserPreferencesToMemory(draft.userPreferences),
  travelBehaviorMetrics: persisted.travelBehaviorMetrics,
  tripReviewSummary: persisted.tripReviewSummary,
  tripConstraints: extractTripConstraintsFromDraft(draft),
  temporaryTripPreferences: extractTemporaryTripPreferencesFromDraft(draft),
});

/**
 * Extra prompt lines so the model receives each memory domain explicitly (Rule 5).
 */
export const buildTripMemoryPromptAppendix = (layers: MemoryLayers): string => {
  const parts: string[] = [];
  parts.push(
    "Memory model (strict separation): (A) account-wide user preferences, (B) aggregate travel-behavior metrics from past trips, (C) optional latest post-trip review summary, (D) hard trip constraints for this itinerary, (E) temporary wizard preferences for this design session only. Never promote (E) into global defaults unless the user explicitly confirms a settings change elsewhere.",
  );

  const g = layers.globalUserPreferences;
  if (g) {
    parts.push(
      `(A) Account preferences: pace ${g.travelPacePreference}, walking tolerance ${g.walkingTolerance}, currency ${g.currency}, cuisine tags (${g.cuisineInterests.slice(0, 12).join(", ") || "none"}), dislikes (${g.dislikedCategories.slice(0, 12).join(", ") || "none"}).`,
    );
  } else {
    parts.push("(A) Account preferences: not loaded — avoid assuming global taste defaults.");
  }

  const b = layers.travelBehaviorMetrics;
  if (b && b.totalTrips > 0) {
    parts.push(
      `(B) Aggregate behavior metrics only: trips ${b.totalTrips}, planned items ${b.totalPlannedItems}, completed ${b.totalCompletedItems}, skipped ${b.totalSkippedItems}, avg completion ${(b.averageCompletionRate * 100).toFixed(0)}%, avg skip ${(b.averageSkipRate * 100).toFixed(0)}%, avg delay ${Math.round(b.averageDelayMinutes)}m, inferred pace ${b.preferredPace}, planning bias ${b.planningBias}.`,
    );
  } else {
    parts.push("(B) Aggregate behavior metrics: unavailable or opted out — do not infer past pacing from preferences.");
  }

  const r = layers.tripReviewSummary;
  if (r) {
    parts.push(
      `(C) Latest stored trip review (structured): completion ${(r.completionRate * 100).toFixed(0)}%, skip ${(r.skipRate * 100).toFixed(0)}%, delay ${Math.round(r.averageDelayMinutes)}m; overloaded days ${r.overloadedDays.slice(0, 4).join(", ") || "none"}; insights: ${r.insights.slice(0, 4).join(" | ") || "none"}.`,
    );
  } else {
    parts.push("(C) Trip review summary: not included for this request.");
  }

  const c = layers.tripConstraints;
  parts.push(
    `(D) Trip constraints: mode ${c.planningMode}, budget ${c.budget.amount} ${c.budget.currency} (${c.budget.style}), dates ${c.dateRange.start}→${c.dateRange.end}, destination label "${c.destination}", ${c.tripSegments.length} segment(s), anchors ${c.anchorEvents.length}.`,
  );

  const e = layers.temporaryTripPreferences;
  parts.push(
    `(E) Temporary wizard preferences (this itinerary only): party ${e.preferences.partyComposition}, pace ${e.preferences.pace}, vibe [${e.preferences.vibe.slice(0, 8).join(", ")}], food interests [${e.preferences.foodInterests.slice(0, 8).join(", ")}], avoids [${e.preferences.avoids.slice(0, 8).join(", ")}], execution density ${e.executionProfile.scheduleDensity}, exploration ${e.executionProfile.explorationSpeed}.`,
  );

  return parts.join("\n");
};
