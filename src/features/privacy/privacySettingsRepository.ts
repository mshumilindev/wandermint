import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { timestampToIso } from "../../services/firebase/timestampMapper";
import { createDefaultPrivacySettings, privacySettingsSchema, type PrivacySettings } from "./privacySettings.types";

const privacyDocRef = (userId: string) => doc(firestoreDb, firestoreCollections.privacySettings, userId);

export const privacySettingsRepository = {
  getPrivacySettings: async (userId: string): Promise<PrivacySettings> => {
    if (!userId.trim()) {
      return createDefaultPrivacySettings("");
    }

    const snapshot = await getDoc(privacyDocRef(userId));
    if (!snapshot.exists()) {
      return createDefaultPrivacySettings(userId);
    }

    const raw = snapshot.data() as Record<string, unknown>;
    const merged = { ...createDefaultPrivacySettings(userId), ...raw };
    return privacySettingsSchema.parse({
      ...merged,
      updatedAt: typeof merged.updatedAt === "string" ? merged.updatedAt : timestampToIso(merged.updatedAt),
    });
  },

  savePrivacySettings: async (settings: PrivacySettings): Promise<void> => {
    if (!settings.userId.trim()) {
      return;
    }
    await setDoc(privacyDocRef(settings.userId), settings);
  },
};
