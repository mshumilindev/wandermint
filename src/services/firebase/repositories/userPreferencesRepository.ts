import { doc, getDoc, setDoc } from "firebase/firestore";
import { z } from "zod";
import type { AvoidConstraint, PreferenceProfile, RightNowExploreSpeed, UserPreferences } from "../../../entities/user/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { nowIso, timestampToIso } from "../timestampMapper";
import { defaultPreferenceProfile, mergePreferenceProfile } from "../../preferences/preferenceConstraintsService";
import { defaultStoryTravelPreferences, mergeStoryTravelPreferences } from "../../storyTravel/storyTravelDefaults";
import type { StoryTravelPreferences } from "../../storyTravel/storyTravelTypes";

const avoidConstraintSchema: z.ZodType<AvoidConstraint> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("country"), value: z.string().max(160) }),
  z.object({ type: z.literal("city"), value: z.string().max(160) }),
  z.object({ type: z.literal("region"), value: z.string().max(200) }),
  z.object({ type: z.literal("category"), value: z.string().max(120) }),
]);

const preferenceProfileSchema = z.object({
  avoid: z.array(avoidConstraintSchema).max(48),
  prefer: z.array(z.string().max(200)).max(48),
});

const userPreferencesSchema = z.object({
  userId: z.string(),
  locale: z.string(),
  currency: z.string(),
  homeCity: z.string(),
  audioMuted: z.boolean().default(false),
  preferredPace: z.enum(["slow", "balanced", "dense"]),
  rightNowExploreSpeed: z.enum(["relaxed", "balanced", "packed"]).optional(),
  walkingTolerance: z.enum(["low", "medium", "high"]),
  foodInterests: z.array(z.string()),
  avoids: z.array(z.string()),
  trackAchievements: z.boolean().optional(),
  allowPersonalAnalytics: z.boolean().optional(),
  storyTravel: z
    .unknown()
    .optional()
    .transform((val) => mergeStoryTravelPreferences(val as Partial<StoryTravelPreferences> | null)),
  preferenceProfile: z
    .unknown()
    .optional()
    .transform((val) => (val === undefined || val === null ? defaultPreferenceProfile() : mergePreferenceProfile(val as PreferenceProfile))),
  updatedAt: z.string(),
});

const resolveRightNowExploreSpeed = (data: z.infer<typeof userPreferencesSchema>): RightNowExploreSpeed => {
  if (data.rightNowExploreSpeed) {
    return data.rightNowExploreSpeed;
  }
  if (data.preferredPace === "slow") {
    return "relaxed";
  }
  if (data.preferredPace === "dense") {
    return "packed";
  }
  return "balanced";
};

const withResolvedExploreSpeed = (data: z.infer<typeof userPreferencesSchema>): UserPreferences => ({
  ...data,
  rightNowExploreSpeed: resolveRightNowExploreSpeed(data),
  allowPersonalAnalytics: data.allowPersonalAnalytics ?? false,
  trackAchievements: data.trackAchievements ?? true,
  storyTravel: mergeStoryTravelPreferences(data.storyTravel),
});

const createDefaultPreferences = (userId: string): UserPreferences => ({
  userId,
  locale: "en",
  currency: "USD",
  homeCity: "",
  audioMuted: false,
  preferredPace: "balanced",
  rightNowExploreSpeed: "balanced",
  walkingTolerance: "medium",
  foodInterests: [],
  avoids: [],
  trackAchievements: true,
  allowPersonalAnalytics: false,
  storyTravel: defaultStoryTravelPreferences(),
  preferenceProfile: defaultPreferenceProfile(),
  updatedAt: nowIso(),
});

export const userPreferencesRepository = {
  getPreferences: async (userId: string): Promise<UserPreferences> => {
    if (!userId.trim()) {
      return createDefaultPreferences("");
    }

    const snapshot = await getDoc(doc(firestoreDb, firestoreCollections.userPreferences, userId));
    if (!snapshot.exists()) {
      return createDefaultPreferences(userId);
    }

    const data = snapshot.data();
    return withResolvedExploreSpeed(
      userPreferencesSchema.parse({
        ...data,
        updatedAt: timestampToIso(data.updatedAt),
      }),
    );
  },

  savePreferences: async (preferences: UserPreferences): Promise<void> => {
    if (!preferences.userId.trim()) {
      return;
    }

    await setDoc(doc(firestoreDb, firestoreCollections.userPreferences, preferences.userId), preferences);
  },
};
