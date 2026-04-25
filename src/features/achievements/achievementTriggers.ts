import i18next from "../../i18n/i18n";
import { useTripsStore } from "../../app/store/useTripsStore";
import { useUiStore, type UiAchievementToast } from "../../app/store/useUiStore";
import { debugLogError } from "../../shared/lib/errors";
import { invalidateTravelAnalyticsCache } from "../analytics/analyticsRepository";
import { evaluateAchievements, evaluateAllAchievementsForUser } from "./achievementEngine";
import type { AchievementEvaluationContext, AchievementUnlockNotice } from "./achievement.types";
import { isUserAchievementTrackingEnabled } from "./achievementTrackingGate";

export { ACHIEVEMENT_CATALOG, ACHIEVEMENT_DEFINITIONS, evaluateAchievements, evaluateAllAchievementsForUser } from "./achievementEngine";

export { isUserAchievementTrackingEnabled } from "./achievementTrackingGate";

const toSingleAchievementToast = (notice: AchievementUnlockNotice, tripLabel?: string): UiAchievementToast => ({
  kind: "single",
  title: notice.title,
  description: notice.description,
  category: notice.category,
  iconKey: notice.icon,
  ...(tripLabel ? { tripLabel } : {}),
});

const toBatchAchievementToast = (notices: AchievementUnlockNotice[], tripLabel?: string): UiAchievementToast => ({
  kind: "batch",
  count: notices.length,
  previewTitles: notices.slice(0, 2).map((n) => n.title),
  ...(tripLabel ? { tripLabel } : {}),
});

/** One toast per evaluation run; trip lifecycle uses a trip-scoped summary when anything unlocks. */
const pushUnlockToasts = (unlocked: AchievementUnlockNotice[], options?: { tripLabel?: string }): void => {
  if (unlocked.length === 0) {
    return;
  }
  const pushToast = useUiStore.getState().pushToast;
  const tripLabel = options?.tripLabel?.trim();
  if (tripLabel) {
    if (unlocked.length === 1) {
      const first = unlocked[0];
      if (first) {
        pushToast({
          message: i18next.t("achievements.afterTripUnlockOne", { trip: tripLabel, title: first.title }),
          tone: "success",
          achievement: toSingleAchievementToast(first, tripLabel),
        });
      }
      return;
    }
    pushToast({
      message: i18next.t("achievements.afterTripUnlockMany", { trip: tripLabel, count: unlocked.length }),
      tone: "success",
      achievement: toBatchAchievementToast(unlocked, tripLabel),
    });
    return;
  }
  if (unlocked.length === 1) {
    const first = unlocked[0];
    if (first) {
      pushToast({
        message: i18next.t("achievements.unlockedToast", { title: first.title }),
        tone: "success",
        achievement: toSingleAchievementToast(first),
      });
    }
    return;
  }
  pushToast({
    message: i18next.t("achievements.unlockedManyToast", { count: unlocked.length }),
    tone: "success",
    achievement: toBatchAchievementToast(unlocked),
  });
};

const runEvaluation = async (
  userId: string,
  context: AchievementEvaluationContext,
  toastOptions?: { tripLabel?: string },
): Promise<void> => {
  if (!isUserAchievementTrackingEnabled()) {
    return;
  }
  const unlocked = await evaluateAchievements(userId, context);
  pushUnlockToasts(unlocked, toastOptions);
  if (unlocked.length > 0) {
    invalidateTravelAnalyticsCache(userId);
  }
};

/**
 * Re-evaluates the full catalog (full metric load). Prefer {@link evaluateAchievements} with a
 * narrow {@link AchievementEvaluationContext} when possible.
 */
export const refreshUserAchievements = async (userId: string): Promise<void> => {
  if (!isUserAchievementTrackingEnabled()) {
    return;
  }
  const unlocked = await evaluateAllAchievementsForUser(userId);
  pushUnlockToasts(unlocked);
  if (unlocked.length > 0) {
    invalidateTravelAnalyticsCache(userId);
  }
};

export const achievementTriggers = {
  onTripLifecycleMayHaveChanged: async (
    userId: string,
    tripId: string,
    options?: { updatedBehaviorProfile?: boolean },
  ): Promise<void> => {
    try {
      const trip = useTripsStore.getState().tripsById[tripId];
      const tripLabel = trip?.title?.trim() || i18next.t("achievements.unnamedTrip");
      await runEvaluation(
        userId,
        {
          completedTrip: { tripId },
          ...(options?.updatedBehaviorProfile ? { updatedBehaviorProfile: true } : {}),
        },
        { tripLabel },
      );
    } catch (error) {
      debugLogError("achievements_trip_refresh", error);
    }
  },

  onActivityCompletionMayHaveChanged: async (
    userId: string,
    meta: { tripId: string; dayId: string; blockId: string },
  ): Promise<void> => {
    try {
      await runEvaluation(userId, { completedItem: meta });
    } catch (error) {
      debugLogError("achievements_activity_refresh", error);
    }
  },

  onBucketListProgressMayHaveChanged: async (userId: string): Promise<void> => {
    try {
      await runEvaluation(userId, { updatedBucketList: true });
    } catch (error) {
      debugLogError("achievements_bucket_refresh", error);
    }
  },

};
