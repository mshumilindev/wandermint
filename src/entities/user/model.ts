import type { StoryTravelPreferences } from "../../services/storyTravel/storyTravelTypes";

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  avatarUrlHighRes: string | null;
}

/** Written by Cloud Functions — no tokens in this object. */
export interface InstagramSummary {
  connected: boolean;
  reconnectNeeded?: boolean;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  avatarUrlHighRes: string | null;
  authProvider: "google";
  createdAt: string;
  updatedAt: string;
  instagramSummary?: InstagramSummary;
}

/** How many stops and how tight Right now routes should feel (local scenarios). */
export type RightNowExploreSpeed = "relaxed" | "balanced" | "packed";

/** Hard travel blocks — countries, cities, free-text regions, or activity tags. */
export type AvoidConstraint =
  | { type: "country"; value: string }
  | { type: "city"; value: string }
  | { type: "region"; value: string }
  | { type: "category"; value: string };

/** Global favourite / avoid profile (stored on {@link UserPreferences}). */
export type PreferenceProfile = {
  avoid: AvoidConstraint[];
  /** Soft bias lines — never override {@link AvoidConstraint}. */
  prefer: string[];
};

export interface UserPreferences {
  userId: string;
  locale: string;
  currency: string;
  homeCity: string;
  audioMuted: boolean;
  preferredPace: "slow" | "balanced" | "dense";
  /** When set, tunes Right now density; otherwise derived from `preferredPace` when loading legacy docs. */
  rightNowExploreSpeed?: RightNowExploreSpeed;
  walkingTolerance: "low" | "medium" | "high";
  foodInterests: string[];
  avoids: string[];
  /**
   * When false, achievement evaluation and unlock toasts are skipped (achievements stay optional).
   * Omitted or true = default on.
   */
  trackAchievements?: boolean;
  /**
   * When true, WanderMint may aggregate non-GPS trip statistics for your personal analytics dashboard and a short-lived device cache.
   * Omitted or false = off (private by default). Trip itineraries in Firestore are unchanged.
   */
  allowPersonalAnalytics?: boolean;
  /** Structured avoid/prefer constraints — applies to suggestions, generation, and routing hints. */
  preferenceProfile?: PreferenceProfile;
  /** Optional story / literary / adaptation inspiration layer (defaults applied when omitted). */
  storyTravel?: StoryTravelPreferences;
  updatedAt: string;
}
