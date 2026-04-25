import { useUserPreferencesStore } from "../../app/store/useUserPreferencesStore";

/** When false, skip achievement evaluation and unlock toasts (Preferences). */
export const isUserAchievementTrackingEnabled = (): boolean =>
  useUserPreferencesStore.getState().preferences?.trackAchievements !== false;
