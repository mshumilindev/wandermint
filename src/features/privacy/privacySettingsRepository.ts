import { doc, getDoc, setDoc } from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { timestampToIso } from "../../services/firebase/timestampMapper";
import { createDefaultPrivacySettings, privacySettingsSchema, type PrivacySettings } from "./privacySettings.types";

const legacyPrivacyDocRef = (userId: string) => doc(firestoreDb, firestoreCollections.privacySettings, userId);
const scopedPrivacyDocRef = (userId: string) => doc(firestoreDb, firestoreCollections.users, userId, "privacySettings", "current");

const isPermissionDenied = (error: unknown): error is FirebaseError =>
  error instanceof FirebaseError && error.code === "permission-denied";

const parsePrivacySettingsDoc = (userId: string, raw: Record<string, unknown>): PrivacySettings => {
  const merged = { ...createDefaultPrivacySettings(userId), ...raw };
  return privacySettingsSchema.parse({
    ...merged,
    updatedAt: typeof merged.updatedAt === "string" ? merged.updatedAt : timestampToIso(merged.updatedAt),
  });
};

export const privacySettingsRepository = {
  getPrivacySettings: async (userId: string): Promise<PrivacySettings> => {
    if (!userId.trim()) {
      return createDefaultPrivacySettings("");
    }

    try {
      const snapshot = await getDoc(legacyPrivacyDocRef(userId));
      if (snapshot.exists()) {
        return parsePrivacySettingsDoc(userId, snapshot.data() as Record<string, unknown>);
      }
    } catch (error) {
      if (!isPermissionDenied(error)) {
        throw error;
      }
    }

    try {
      const scopedSnapshot = await getDoc(scopedPrivacyDocRef(userId));
      if (!scopedSnapshot.exists()) {
        return createDefaultPrivacySettings(userId);
      }
      return parsePrivacySettingsDoc(userId, scopedSnapshot.data() as Record<string, unknown>);
    } catch (error) {
      if (isPermissionDenied(error)) {
        return createDefaultPrivacySettings(userId);
      }
      throw error;
    }
  },

  savePrivacySettings: async (settings: PrivacySettings): Promise<void> => {
    if (!settings.userId.trim()) {
      return;
    }

    try {
      await setDoc(legacyPrivacyDocRef(settings.userId), settings);
      return;
    } catch (error) {
      if (!isPermissionDenied(error)) {
        throw error;
      }
    }

    await setDoc(scopedPrivacyDocRef(settings.userId), settings);
  },
};
