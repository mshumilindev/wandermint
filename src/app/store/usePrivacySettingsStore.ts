import { create } from "zustand";
import { privacySettingsRepository } from "../../features/privacy/privacySettingsRepository";
import type { PrivacySettings } from "../../features/privacy/privacySettings.types";
import { nowIso } from "../../services/firebase/timestampMapper";
import { getErrorMessage } from "../../shared/lib/errors";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";

interface PrivacySettingsState {
  settings: PrivacySettings | null;
  meta: CacheMeta;
  ensurePrivacySettings: (userId: string) => Promise<void>;
  savePrivacySettings: (settings: PrivacySettings) => Promise<void>;
}

export const usePrivacySettingsStore = create<PrivacySettingsState>((set, get) => ({
  settings: null,
  meta: createIdleCacheMeta(),

  ensurePrivacySettings: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    if (isCacheFresh(get().meta, cacheDurations.long) && get().settings?.userId === userId) {
      return;
    }

    set((state) => ({ meta: { ...state.meta, status: "loading", error: null } }));
    try {
      const settings = await privacySettingsRepository.getPrivacySettings(userId);
      set({ settings, meta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null } });
    } catch (error) {
      set((state) => ({ meta: { ...state.meta, status: "error", error: getErrorMessage(error) } }));
    }
  },

  savePrivacySettings: async (settings) => {
    if (!settings.userId.trim()) {
      return;
    }
    const next = { ...settings, updatedAt: nowIso() };
    await privacySettingsRepository.savePrivacySettings(next);
    set({ settings: next, meta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null } });
  },
}));
