import { travelMemoriesRepository } from "../../services/firebase/repositories/travelMemoriesRepository";
import { tripsRepository } from "../../services/firebase/repositories/tripsRepository";
import { tripReviewsRepository } from "../../services/firebase/repositories/tripReviewsRepository";
import { travelBehaviorRepository } from "../user-behavior/travelBehaviorRepository";
import { achievementRepository } from "../achievements/achievementRepository";
import { createEmptyUserAchievementMetrics, loadAchievementAnalyticsMetrics } from "../achievements/achievementEngine";
import { bucketListRepository } from "../bucket-list/bucketListRepository";
import { buildTravelAnalyticsBundle } from "./analyticsCalculator";
import type { BucketListAnalyticsSummary, TravelAnalyticsBundle, TravelAnalyticsRawInput } from "./analytics.types";
import { createEmptyTripAnalyticsScan } from "./analytics.types";
import { scanTripAnalyticsData } from "./analyticsTripScan";

const CACHE_TTL_MS = 45_000;
const cache = new Map<string, { expiresAt: number; bundle: TravelAnalyticsBundle }>();

export const invalidateTravelAnalyticsCache = (userId: string): void => {
  cache.delete(userId.trim());
};

/** Clears the in-memory analytics dashboard cache only (trips and raw plans are untouched). */
export const deleteAnalyticsCacheForUser = invalidateTravelAnalyticsCache;

const loadBucketSummary = async (userId: string): Promise<BucketListAnalyticsSummary> => {
  const rows = await bucketListRepository.listByUserId(userId).catch(() => []);
  const total = rows.length;
  const visited = rows.filter((r) => r.visited).length;
  return { total, visited, remaining: Math.max(0, total - visited) };
};

const loadRawInputs = async (userId: string): Promise<TravelAnalyticsRawInput> => {
  const uid = userId.trim();
  const [behaviorProfile, tripReviews, achievements, trips, bucketListSummary, travelMemories] = await Promise.all([
    travelBehaviorRepository.getProfile(uid).catch(() => null),
    tripReviewsRepository.listByUserId(uid).catch(() => []),
    achievementRepository.listByUserId(uid).catch(() => []),
    tripsRepository.getUserTrips(uid),
    loadBucketSummary(uid),
    travelMemoriesRepository.getUserTravelMemories(uid).catch(() => []),
  ]);
  const metrics = await loadAchievementAnalyticsMetrics(uid, trips, travelMemories);
  const tripScan = await scanTripAnalyticsData(trips, tripReviews, travelMemories);

  return {
    userId: uid,
    behaviorProfile,
    tripReviews,
    achievements,
    metrics,
    tripPlanRollups: tripScan.rollups,
    tripScan,
    bucketListSummary,
  };
};

const buildEmptyBundleForUserId = (uid: string): TravelAnalyticsBundle =>
  buildTravelAnalyticsBundle({
    userId: uid,
    behaviorProfile: null,
    tripReviews: [],
    achievements: [],
    metrics: createEmptyUserAchievementMetrics(),
    tripPlanRollups: [],
    tripScan: createEmptyTripAnalyticsScan(),
    bucketListSummary: { total: 0, visited: 0, remaining: 0 },
  });

export const analyticsRepository = {
  invalidateForUser: invalidateTravelAnalyticsCache,
  deleteAnalyticsCacheForUser,

  /**
   * Loads aggregated analytics (computed on read; short-lived in-memory cache only).
   * When {@link opts.allowPersonalAnalytics} is not true, skips Firestore reads and never writes the cache.
   */
  loadDashboard: async (userId: string, opts?: { bypassCache?: boolean; allowPersonalAnalytics?: boolean }): Promise<TravelAnalyticsBundle> => {
    const uid = userId.trim();
    if (!uid) {
      return buildTravelAnalyticsBundle({
        userId: "",
        behaviorProfile: null,
        tripReviews: [],
        achievements: [],
        metrics: createEmptyUserAchievementMetrics(),
        tripPlanRollups: [],
        tripScan: createEmptyTripAnalyticsScan(),
        bucketListSummary: { total: 0, visited: 0, remaining: 0 },
      });
    }

    if (opts?.allowPersonalAnalytics !== true) {
      invalidateTravelAnalyticsCache(uid);
      return { ...buildEmptyBundleForUserId(uid), personalAnalyticsOptedOut: true };
    }

    if (!opts?.bypassCache) {
      const hit = cache.get(uid);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.bundle;
      }
    }

    const raw = await loadRawInputs(uid);
    const bundle = buildTravelAnalyticsBundle(raw);
    cache.set(uid, { expiresAt: Date.now() + CACHE_TTL_MS, bundle });
    return bundle;
  },
};
