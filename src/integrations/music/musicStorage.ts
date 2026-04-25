import { collection, deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { z } from "zod";
import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { nowIso } from "../../services/firebase/timestampMapper";
import type { MusicPersonalizationSettings, MusicProviderConnection, MusicTasteProfile } from "./musicTypes";
import { defaultMusicPersonalizationSettings } from "./musicTypes";

const userRoot = (userId: string) => doc(firestoreDb, firestoreCollections.users, userId);

const musicCol = (userId: string) => collection(userRoot(userId), "musicIntegrations");

export const musicDocRefs = {
  profile: (userId: string) => doc(musicCol(userId), "profile"),
  settings: (userId: string) => doc(musicCol(userId), "settings"),
  provider: (userId: string, providerKey: string) => doc(musicCol(userId), `provider_${providerKey}`),
};

const connectionSchema = z.object({
  provider: z.enum(["spotify", "appleMusic", "youtubeMusic"]),
  status: z.enum(["not_connected", "connecting", "connected", "expired", "error", "unsupported"]),
  connectedAt: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

const tasteProfileSchema = z.object({
  userId: z.string(),
  providers: z.array(connectionSchema),
  updatedAt: z.string(),
  expiresAt: z.string(),
});

const settingsSchema = z.object({
  useMusicTastePersonalization: z.boolean(),
  allowConcertSuggestions: z.boolean(),
  allowVenueSuggestions: z.boolean(),
  allowAiMusicInterpretation: z.boolean(),
  updatedAt: z.string().optional(),
});

export const musicStorage = {
  getProfile: async (userId: string): Promise<MusicTasteProfile | null> => {
    if (!userId.trim()) {
      return null;
    }
    try {
      const snap = await getDoc(musicDocRefs.profile(userId));
      if (!snap.exists()) {
        return null;
      }
      const parsed = tasteProfileSchema.safeParse(snap.data());
      if (!parsed.success) {
        return null;
      }
      return snap.data() as MusicTasteProfile;
    } catch {
      return null;
    }
  },

  saveProfile: async (userId: string, profile: MusicTasteProfile): Promise<void> => {
    await setDoc(musicDocRefs.profile(userId), profile as Record<string, unknown>);
  },

  deleteProfile: async (userId: string): Promise<void> => {
    try {
      await deleteDoc(musicDocRefs.profile(userId));
    } catch {
      /* ignore */
    }
  },

  getSettings: async (userId: string): Promise<MusicPersonalizationSettings> => {
    if (!userId.trim()) {
      return defaultMusicPersonalizationSettings();
    }
    try {
      const snap = await getDoc(musicDocRefs.settings(userId));
      if (!snap.exists()) {
        return defaultMusicPersonalizationSettings();
      }
      const raw = snap.data();
      const parsed = settingsSchema.safeParse(raw);
      if (!parsed.success) {
        return defaultMusicPersonalizationSettings();
      }
      return {
        useMusicTastePersonalization: parsed.data.useMusicTastePersonalization,
        allowConcertSuggestions: parsed.data.allowConcertSuggestions,
        allowVenueSuggestions: parsed.data.allowVenueSuggestions,
        allowAiMusicInterpretation: parsed.data.allowAiMusicInterpretation,
      };
    } catch {
      return defaultMusicPersonalizationSettings();
    }
  },

  saveSettings: async (userId: string, settings: MusicPersonalizationSettings): Promise<void> => {
    await setDoc(musicDocRefs.settings(userId), { ...settings, updatedAt: nowIso() });
  },

  getProviderConnection: async (userId: string, providerKey: string): Promise<MusicProviderConnection | null> => {
    if (!userId.trim()) {
      return null;
    }
    try {
      const snap = await getDoc(musicDocRefs.provider(userId, providerKey));
      if (!snap.exists()) {
        return null;
      }
      const row = connectionSchema.safeParse(snap.data());
      return row.success ? row.data : null;
    } catch {
      return null;
    }
  },

  saveProviderConnection: async (userId: string, row: MusicProviderConnection): Promise<void> => {
    await setDoc(musicDocRefs.provider(userId, row.provider), row as Record<string, unknown>);
  },

  deleteProviderConnection: async (userId: string, providerKey: string): Promise<void> => {
    try {
      await deleteDoc(musicDocRefs.provider(userId, providerKey));
    } catch {
      /* ignore */
    }
  },
};
