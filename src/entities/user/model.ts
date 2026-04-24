export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  avatarUrlHighRes: string | null;
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
}

export interface UserPreferences {
  userId: string;
  locale: string;
  currency: string;
  homeCity: string;
  audioMuted: boolean;
  preferredPace: "slow" | "balanced" | "dense";
  walkingTolerance: "low" | "medium" | "high";
  foodInterests: string[];
  avoids: string[];
  updatedAt: string;
}
