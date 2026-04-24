import { doc, getDoc, setDoc } from "firebase/firestore";
import { z } from "zod";
import type { UserPreferences } from "../../../entities/user/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { nowIso, timestampToIso } from "../timestampMapper";

const userPreferencesSchema = z.object({
  userId: z.string(),
  locale: z.string(),
  currency: z.string(),
  homeCity: z.string(),
  audioMuted: z.boolean().default(false),
  preferredPace: z.enum(["slow", "balanced", "dense"]),
  walkingTolerance: z.enum(["low", "medium", "high"]),
  foodInterests: z.array(z.string()),
  avoids: z.array(z.string()),
  updatedAt: z.string(),
});

const createDefaultPreferences = (userId: string): UserPreferences => ({
  userId,
  locale: "en",
  currency: "USD",
  homeCity: "",
  audioMuted: false,
  preferredPace: "balanced",
  walkingTolerance: "medium",
  foodInterests: [],
  avoids: [],
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
    return userPreferencesSchema.parse({
      ...data,
      updatedAt: timestampToIso(data.updatedAt),
    });
  },

  savePreferences: async (preferences: UserPreferences): Promise<void> => {
    if (!preferences.userId.trim()) {
      return;
    }

    await setDoc(doc(firestoreDb, firestoreCollections.userPreferences, preferences.userId), preferences);
  },
};
