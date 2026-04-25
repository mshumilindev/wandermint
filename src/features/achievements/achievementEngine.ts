import type { ActivityBlock } from "../../entities/activity/model";
import type { Trip } from "../../entities/trip/model";
import { countBucketPlacesDeduped, countVisitedBucketPlacesDeduped } from "../bucket-list/bucketListDedupe";
import { bucketListRepository } from "../bucket-list/bucketListRepository";
import { buildCompletedTripForTripReviewFromDayPlans } from "../trip-review/buildCompletedTripFromDayPlans";
import { analyzeCompletedTrip } from "../trip-review/tripReviewCalculator";
import { tripDaysRepository } from "../../services/firebase/repositories/tripDaysRepository";
import { tripsRepository } from "../../services/firebase/repositories/tripsRepository";
import { nowIso } from "../../services/firebase/timestampMapper";
import { ACHIEVEMENT_DEFINITIONS } from "./achievement.definitions";
import { isUserAchievementTrackingEnabled } from "./achievementTrackingGate";
import type {
  Achievement,
  AchievementCondition,
  AchievementEvaluationContext,
  AchievementEvaluationSignal,
  AchievementProgress,
  AchievementUnlockNotice,
} from "./achievement.types";
import type { AchievementProgressDocument } from "./achievementRepository";
import { achievementRepository } from "./achievementRepository";

/** Re-export catalog for callers that import from the engine module. */
export const ACHIEVEMENT_CATALOG: readonly Achievement[] = ACHIEVEMENT_DEFINITIONS;

export { ACHIEVEMENT_DEFINITIONS } from "./achievement.definitions";

export type CompletedTripMetricRow = {
  completionRate: number;
  averageStartDelayMinutes: number;
  delaySampleCount: number;
  travelDelayDayCount: number;
};

/** Deterministic inputs derived only from stored trips, day plans, and bucket list rows. */
export type UserAchievementMetrics = {
  doneVisitCount: number;
  doneVisitCountByCategory: Record<string, number>;
  distinctCitiesWithDoneVisit: number;
  distinctCountriesWithDoneVisit: number;
  bucketItemsCompleted: number;
  /** Distinct bucket list rows (deduped), for collector-style achievements. */
  bucketPlacesCollected: number;
  uniqueDoneCategories: number;
  completedTripsCount: number;
  foodRelatedDoneVisits: number;
  bestSingleTripCompletionRate: number;
  completedTripMetricRows: readonly CompletedTripMetricRow[];
};

export type EvaluatedAchievementState = Pick<AchievementProgress, "progress" | "target" | "unlocked">;

const norm = (s: string): string => s.trim().toLowerCase();

const normCategory = (c: string): string => c.trim().toLowerCase();

const segmentCountry = (trip: Trip, segmentId: string): string | undefined => {
  const seg = trip.tripSegments.find((s) => s.id === segmentId);
  return seg?.country?.trim();
};

const emptyMetrics = (): UserAchievementMetrics => ({
  doneVisitCount: 0,
  doneVisitCountByCategory: {},
  distinctCitiesWithDoneVisit: 0,
  distinctCountriesWithDoneVisit: 0,
  bucketItemsCompleted: 0,
  bucketPlacesCollected: 0,
  uniqueDoneCategories: 0,
  completedTripsCount: 0,
  foodRelatedDoneVisits: 0,
  bestSingleTripCompletionRate: 0,
  completedTripMetricRows: [],
});

/** Empty metrics object for dashboards when the user id is not yet available. */
export const createEmptyUserAchievementMetrics = (): UserAchievementMetrics => emptyMetrics();

const isFoodRelatedBlock = (block: ActivityBlock): boolean => {
  const t = block.type.trim().toLowerCase();
  if (t === "meal") {
    return true;
  }
  const hay = `${block.type} ${block.title} ${block.category}`.toLowerCase();
  return /\b(lunch|dinner|brunch|coffee|café|cafe|snack|food|restaurant|bar|pub|dining|wine|beer|tasting|bakery|bistro)\b/.test(hay);
};

type MetricNeeds = {
  tripStatuses: boolean;
  dayScan: boolean;
  perTripMetrics: boolean;
  bucket: boolean;
};

const inferMetricNeeds = (definitions: Achievement[]): MetricNeeds => {
  const needs: MetricNeeds = { tripStatuses: false, dayScan: false, perTripMetrics: false, bucket: false };
  for (const def of definitions) {
    for (const c of def.conditions) {
      switch (c.type) {
        case "visit_count":
        case "countries_visited":
        case "cities_visited":
        case "unique_categories":
        case "food_related_visits":
          needs.dayScan = true;
          break;
        case "trips_completed":
          needs.tripStatuses = true;
          break;
        case "best_trip_completion_rate":
        case "trips_above_completion_rate_count":
        case "efficient_completed_trip":
          needs.perTripMetrics = true;
          needs.tripStatuses = true;
          break;
        case "bucket_items_completed":
        case "bucket_places_collected":
          needs.bucket = true;
          break;
      }
    }
  }
  return needs;
};

const resolveAffectedKeys = (context: AchievementEvaluationContext): Set<string> => {
  if (context.evaluateAll === true) {
    return new Set(ACHIEVEMENT_DEFINITIONS.map((a) => a.key));
  }

  const activeSignals = new Set<AchievementEvaluationSignal>();
  if (context.completedTrip) {
    activeSignals.add("completedTrip");
  }
  if (context.completedItem) {
    activeSignals.add("completedItem");
  }
  if (context.updatedBucketList) {
    activeSignals.add("updatedBucketList");
  }
  if (context.updatedBehaviorProfile) {
    activeSignals.add("updatedBehaviorProfile");
  }

  if (activeSignals.size === 0) {
    return new Set();
  }

  const keys = new Set<string>();
  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const hit = def.evaluationSignals.some((s) => activeSignals.has(s));
    if (hit) {
      keys.add(def.key);
    }
  }
  return keys;
};

const collectTripDerivedMetrics = async (trips: Trip[], needs: MetricNeeds): Promise<Partial<UserAchievementMetrics>> => {
  const partial: Partial<UserAchievementMetrics> = {};

  if (needs.tripStatuses && !needs.dayScan && !needs.perTripMetrics) {
    partial.completedTripsCount = trips.filter((t) => t.status === "completed").length;
    return partial;
  }

  if (needs.tripStatuses) {
    partial.completedTripsCount = trips.filter((t) => t.status === "completed").length;
  }

  let doneVisitCount = 0;
  const doneVisitCountByCategory: Record<string, number> = {};
  const categoryUniverse = new Set<string>();
  const citiesWithDone = new Set<string>();
  const countriesWithDone = new Set<string>();
  let foodRelatedDoneVisits = 0;

  const perTripRows: CompletedTripMetricRow[] = [];
  let bestSingle = 0;

  const needsDayIteration = needs.dayScan || needs.perTripMetrics;
  if (!needsDayIteration) {
    return partial;
  }

  for (const trip of trips) {
    const days = await tripDaysRepository.getTripDays(trip.id);

    if (needs.dayScan) {
      for (const day of days) {
        const doneBlocks = day.blocks.filter((b) => b.completionStatus === "done");
        if (doneBlocks.length === 0) {
          continue;
        }
        const city = day.cityLabel?.trim();
        if (city) {
          citiesWithDone.add(norm(city));
        }
        const countryRaw = day.countryLabel?.trim() || segmentCountry(trip, day.segmentId);
        if (countryRaw) {
          countriesWithDone.add(norm(countryRaw));
        }
        for (const block of doneBlocks) {
          doneVisitCount += 1;
          const ck = norm(block.category || "unknown");
          doneVisitCountByCategory[ck] = (doneVisitCountByCategory[ck] ?? 0) + 1;
          categoryUniverse.add(ck);
          if (isFoodRelatedBlock(block)) {
            foodRelatedDoneVisits += 1;
          }
        }
      }
    }

    if (needs.perTripMetrics && trip.status === "completed") {
      const travelDelayDayCount = days.filter((d) => d.adjustment?.state === "travel_delay").length;
      const ct = buildCompletedTripForTripReviewFromDayPlans(days, trip);
      if (!ct) {
        perTripRows.push({
          completionRate: 0,
          averageStartDelayMinutes: 0,
          delaySampleCount: 0,
          travelDelayDayCount,
        });
        continue;
      }
      const analysis = analyzeCompletedTrip(ct);
      const avgDelay = Number.isFinite(analysis.averageDelayMinutes) ? analysis.averageDelayMinutes : 0;
      perTripRows.push({
        completionRate: analysis.completionRate,
        averageStartDelayMinutes: avgDelay,
        delaySampleCount: analysis.delaySamples.length,
        travelDelayDayCount,
      });
      bestSingle = Math.max(bestSingle, analysis.completionRate);
    }
  }

  if (needs.dayScan) {
    partial.doneVisitCount = doneVisitCount;
    partial.doneVisitCountByCategory = doneVisitCountByCategory;
    partial.distinctCitiesWithDoneVisit = citiesWithDone.size;
    partial.distinctCountriesWithDoneVisit = countriesWithDone.size;
    partial.uniqueDoneCategories = categoryUniverse.size;
    partial.foodRelatedDoneVisits = foodRelatedDoneVisits;
  }

  if (needs.perTripMetrics) {
    partial.completedTripMetricRows = perTripRows;
    partial.bestSingleTripCompletionRate = bestSingle;
  }

  return partial;
};

const loadMetricsWithTrips = async (userId: string, trips: Trip[], needs: MetricNeeds): Promise<UserAchievementMetrics> => {
  const out = emptyMetrics();
  if (!needs.tripStatuses && !needs.dayScan && !needs.perTripMetrics && !needs.bucket) {
    return out;
  }

  const needsTrips = needs.tripStatuses || needs.dayScan || needs.perTripMetrics;
  const tripsForScan = needsTrips ? trips : [];

  Object.assign(out, await collectTripDerivedMetrics(tripsForScan, needs));

  if (needs.bucket) {
    const rows = await bucketListRepository.listByUserId(userId);
    out.bucketItemsCompleted = countVisitedBucketPlacesDeduped(rows);
    out.bucketPlacesCollected = countBucketPlacesDeduped(rows);
  }

  return out;
};

const loadMetrics = async (userId: string, needs: MetricNeeds): Promise<UserAchievementMetrics> => {
  const trips = await tripsRepository.getUserTrips(userId);
  return loadMetricsWithTrips(userId, trips, needs);
};

/**
 * Full trip- and bucket-derived aggregates for analytics (no achievement definitions required).
 * Pass `trips` when you already loaded the user’s trips to avoid a duplicate fetch.
 */
export const loadAchievementAnalyticsMetrics = async (userId: string, trips?: Trip[]): Promise<UserAchievementMetrics> => {
  const resolved = trips ?? (await tripsRepository.getUserTrips(userId));
  return loadMetricsWithTrips(userId, resolved, { tripStatuses: true, dayScan: true, perTripMetrics: true, bucket: true });
};

const evaluateOneCondition = (condition: AchievementCondition, m: UserAchievementMetrics): EvaluatedAchievementState => {
  switch (condition.type) {
    case "visit_count": {
      const rawCat = condition.category?.trim();
      const current = rawCat ? (m.doneVisitCountByCategory[normCategory(rawCat)] ?? 0) : m.doneVisitCount;
      const target = condition.target;
      return {
        progress: Math.min(current, target),
        target,
        unlocked: current >= target,
      };
    }
    case "countries_visited": {
      const current = m.distinctCountriesWithDoneVisit;
      const target = condition.target;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "cities_visited": {
      const current = m.distinctCitiesWithDoneVisit;
      const target = condition.target;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "bucket_items_completed": {
      const current = m.bucketItemsCompleted;
      const target = condition.target;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "bucket_places_collected": {
      const current = m.bucketPlacesCollected;
      const target = condition.target;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "unique_categories": {
      const current = m.uniqueDoneCategories;
      const target = condition.target;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "trips_completed": {
      const current = m.completedTripsCount;
      const target = condition.target;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "best_trip_completion_rate": {
      const target = 100;
      const progress = Math.min(target, Math.floor(m.bestSingleTripCompletionRate * 100));
      const unlocked = m.bestSingleTripCompletionRate >= condition.threshold;
      return { progress, target, unlocked };
    }
    case "trips_above_completion_rate_count": {
      const current = m.completedTripMetricRows.filter((r) => r.completionRate >= condition.threshold).length;
      const target = condition.minTrips;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "food_related_visits": {
      const current = m.foodRelatedDoneVisits;
      const target = condition.target;
      return { progress: Math.min(current, target), target, unlocked: current >= target };
    }
    case "efficient_completed_trip": {
      const rows = m.completedTripMetricRows;
      const unlocked = rows.some(
        (r) =>
          r.completionRate >= condition.minCompletionRate &&
          r.travelDelayDayCount <= condition.maxTravelDelayDays &&
          (r.delaySampleCount === 0 || r.averageStartDelayMinutes <= condition.maxAverageStartDelayMinutes),
      );
      return { progress: unlocked ? 1 : 0, target: 1, unlocked };
    }
  }
};

/** Progress bar denominator when no Firestore row exists yet. */
export const getAchievementDisplayTarget = (def: Achievement): number => {
  if (def.conditions.length === 0) {
    return 1;
  }
  if (def.conditions.length > 1) {
    return def.conditions.length;
  }
  const c = def.conditions[0];
  if (!c) {
    return 1;
  }
  switch (c.type) {
    case "visit_count":
    case "cities_visited":
    case "countries_visited":
    case "bucket_items_completed":
    case "bucket_places_collected":
    case "unique_categories":
    case "trips_completed":
    case "food_related_visits":
      return Math.max(1, c.target);
    case "trips_above_completion_rate_count":
      return Math.max(1, c.minTrips);
    case "best_trip_completion_rate":
      return 100;
    case "efficient_completed_trip":
      return 1;
    default: {
      const _e: never = c;
      return _e;
    }
  }
};

export const evaluateAchievement = (achievement: Achievement, metrics: UserAchievementMetrics): EvaluatedAchievementState => {
  if (achievement.conditions.length === 0) {
    return { progress: 0, target: 1, unlocked: false };
  }
  if (achievement.conditions.length === 1) {
    const only = achievement.conditions[0];
    if (!only) {
      return { progress: 0, target: 1, unlocked: false };
    }
    return evaluateOneCondition(only, metrics);
  }

  const parts = achievement.conditions.map((c) => evaluateOneCondition(c, metrics));
  const met = parts.filter((p) => p.unlocked).length;
  const target = parts.length;
  return {
    progress: met,
    target,
    unlocked: met === target,
  };
};

const mergeProgress = (
  existing: AchievementProgressDocument | null,
  evaluated: EvaluatedAchievementState,
  userId: string,
  achievementKey: string,
  now: string,
): AchievementProgressDocument | null => {
  if (existing?.unlocked) {
    return null;
  }

  const nextTarget = Math.max(1, evaluated.target, existing?.target ?? 0);
  let nextProgress = Math.max(existing?.progress ?? 0, evaluated.progress);
  const nextUnlocked = Boolean(evaluated.unlocked);
  if (nextUnlocked) {
    nextProgress = Math.max(nextProgress, nextTarget);
  }
  const unlockedAt = nextUnlocked ? now : undefined;

  return {
    userId,
    achievementKey,
    progress: Math.min(nextProgress, nextTarget),
    target: nextTarget,
    unlocked: nextUnlocked,
    unlockedAt,
    updatedAt: now,
  };
};

const toNotice = (def: Achievement): AchievementUnlockNotice => ({
  key: def.key,
  title: def.title,
  description: def.description,
  category: def.category,
  icon: def.icon,
});

/**
 * Central entry: loads minimal metrics, evaluates only achievements implied by `context`,
 * persists monotonic progress, unlocks once, and returns newly unlocked rows for the UI.
 */
export const evaluateAchievements = async (
  userId: string,
  context: AchievementEvaluationContext,
): Promise<AchievementUnlockNotice[]> => {
  const uid = userId.trim();
  if (!uid) {
    return [];
  }
  if (!isUserAchievementTrackingEnabled()) {
    return [];
  }

  const affectedKeys = resolveAffectedKeys(context);
  if (affectedKeys.size === 0) {
    return [];
  }

  const affectedDefs = ACHIEVEMENT_DEFINITIONS.filter((a) => affectedKeys.has(a.key));
  if (affectedDefs.length === 0) {
    return [];
  }

  const needs = inferMetricNeeds(affectedDefs);
  const metrics = await loadMetrics(uid, needs);
  const now = nowIso();
  const newlyUnlocked: AchievementUnlockNotice[] = [];

  for (const def of affectedDefs) {
    const evaluated = evaluateAchievement(def, metrics);
    const existing = await achievementRepository.getByKey(uid, def.key);
    const merged = mergeProgress(existing, evaluated, uid, def.key, now);
    if (!merged) {
      continue;
    }
    if (
      existing &&
      !existing.unlocked &&
      merged.unlocked === existing.unlocked &&
      merged.progress === existing.progress &&
      merged.target === existing.target
    ) {
      continue;
    }
    await achievementRepository.saveProgress(merged);
    if (merged.unlocked && !existing?.unlocked) {
      newlyUnlocked.push(toNotice(def));
    }
  }

  return newlyUnlocked;
};

export const evaluateAllAchievementsForUser = (userId: string): Promise<AchievementUnlockNotice[]> =>
  evaluateAchievements(userId, { evaluateAll: true });
