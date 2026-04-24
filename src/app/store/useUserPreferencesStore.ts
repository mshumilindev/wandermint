import { create } from "zustand";
import type { UserPreferences } from "../../entities/user/model";
import { userPreferencesRepository } from "../../services/firebase/repositories/userPreferencesRepository";
import { getErrorMessage } from "../../shared/lib/errors";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";

interface UserPreferencesState {
  preferences: UserPreferences | null;
  meta: CacheMeta;
  ensurePreferences: (userId: string) => Promise<void>;
  savePreferences: (preferences: UserPreferences) => Promise<void>;
}

export const useUserPreferencesStore = create<UserPreferencesState>((set, get) => ({
  preferences: null,
  meta: createIdleCacheMeta(),

  ensurePreferences: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    if (isCacheFresh(get().meta, cacheDurations.long)) {
      return;
    }

    set((state) => ({ meta: { ...state.meta, status: "loading", error: null } }));
    try {
      const preferences = await userPreferencesRepository.getPreferences(userId);
      set({ preferences, meta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null } });
    } catch (error) {
      set((state) => ({ meta: { ...state.meta, status: "error", error: getErrorMessage(error) } }));
    }
  },

  savePreferences: async (preferences) => {
    if (!preferences.userId.trim()) {
      return;
    }
    await userPreferencesRepository.savePreferences(preferences);
    set({ preferences, meta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null } });
  },
}));
