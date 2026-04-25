import { ACHIEVEMENT_DEFINITIONS } from "../achievements/achievement.definitions";
import { getAchievementDisplayTarget } from "../achievements/achievementEngine";
import type {
  BucketListAnalyticsSummary,
  StyleAxisKey,
  TravelAnalyticsBundle,
  TravelAnalyticsCharts,
  TravelAnalyticsRawInput,
  TravelAnalyticsSummary,
  TravelAnalyticsTrendPoint,
  TripAnalyticsScanResult,
} from "./analytics.types";
import { STYLE_AXIS_KEYS, createEmptyTripAnalyticsScan } from "./analytics.types";
import { buildAnalyticsInsights } from "./analyticsInsights";

const LINE_CHART_MIN_POINTS = 2;
const SKIP_CATEGORY_MIN_TOTAL = 3;
const STYLE_RADAR_MIN_ACTIVE_AXES = 3;
const PACE_ACCURACY_MIN_TRIPS = 2;
const CUMULATIVE_GEO_LINE_MIN_TRIPS = 2;
const CATEGORY_STACK_MIN_TOTAL_ITEMS = 4;

const rollupTotals = (rollups: TravelAnalyticsRawInput["tripPlanRollups"]): { planned: number; completed: number; skipped: number } =>
  rollups.reduce(
    (acc, r) => ({
      planned: acc.planned + r.plannedItems,
      completed: acc.completed + r.completedItems,
      skipped: acc.skipped + r.skippedItems,
    }),
    { planned: 0, completed: 0, skipped: 0 },
  );

const buildSummary = (input: TravelAnalyticsRawInput): TravelAnalyticsSummary => {
  const { behaviorProfile: profile, metrics, tripReviews, achievements, tripPlanRollups: rollups } = input;
  const achievementsUnlocked = achievements.filter((a) => a.unlocked).length;
  const { planned: rollPlanned, completed: rollCompleted, skipped: rollSkipped } = rollupTotals(rollups);
  const completedTrips = metrics.completedTripsCount;

  if (profile) {
    const planned = Math.max(profile.totalPlannedItems, rollPlanned);
    const completed = Math.max(profile.totalCompletedItems, rollCompleted);
    const skipped = Math.max(profile.totalSkippedItems, rollSkipped);
    return {
      totalTrips: Math.max(profile.totalTrips, completedTrips),
      completedTrips,
      totalPlannedItems: planned,
      totalCompletedItems: completed,
      totalSkippedItems: skipped,
      averageCompletionRate: profile.averageCompletionRate,
      averageSkipRate: profile.averageSkipRate,
      averageDelayMinutes: profile.averageDelayMinutes,
      countriesVisited: metrics.distinctCountriesWithDoneVisit,
      citiesVisited: metrics.distinctCitiesWithDoneVisit,
      bucketItemsCompleted: metrics.bucketItemsCompleted,
      achievementsUnlocked,
    };
  }

  const planned = rollPlanned > 0 ? rollPlanned : rollCompleted + rollSkipped;
  const completed = rollCompleted > 0 ? rollCompleted : metrics.doneVisitCount;
  const skipped = rollSkipped;
  const avgCompletion = planned > 0 ? completed / planned : 0;
  const avgSkip = planned > 0 ? skipped / planned : 0;
  const reviewDelay =
    tripReviews.length > 0
      ? tripReviews.reduce((sum, r) => sum + r.review.averageDelayMinutes, 0) / tripReviews.length
      : 0;
  const rowDelay =
    metrics.completedTripMetricRows.length > 0
      ? metrics.completedTripMetricRows.reduce((sum, r) => sum + r.averageStartDelayMinutes, 0) /
        metrics.completedTripMetricRows.length
      : 0;
  const averageDelayMinutes = Math.round(reviewDelay > 0 ? reviewDelay : rowDelay);

  return {
    totalTrips: completedTrips,
    completedTrips,
    totalPlannedItems: planned,
    totalCompletedItems: completed,
    totalSkippedItems: skipped,
    averageCompletionRate: Number.isFinite(avgCompletion) ? avgCompletion : 0,
    averageSkipRate: Number.isFinite(avgSkip) ? avgSkip : 0,
    averageDelayMinutes,
    countriesVisited: metrics.distinctCountriesWithDoneVisit,
    citiesVisited: metrics.distinctCitiesWithDoneVisit,
    bucketItemsCompleted: metrics.bucketItemsCompleted,
    achievementsUnlocked,
  };
};

const buildTrend = (input: TravelAnalyticsRawInput): TravelAnalyticsTrendPoint[] => {
  const sorted = [...input.tripPlanRollups].sort((a, b) => a.tripEndDate.localeCompare(b.tripEndDate));
  const delayByTripId = new Map(input.tripReviews.map((d) => [d.tripId, d.review.averageDelayMinutes]));
  return sorted.map((r, index) => {
    const planned = Math.max(1, r.plannedItems);
    const completionRate = r.completedItems / planned;
    return {
      label: `Trip ${index + 1}`,
      completionRate: Number.isFinite(completionRate) ? completionRate : 0,
      delayMinutes: Math.round(delayByTripId.get(r.tripId) ?? 0),
    };
  });
};

const uniqueDateKey = (date: string, tripId: string, seen: Map<string, number>): string => {
  const n = (seen.get(date) ?? 0) + 1;
  seen.set(date, n);
  if (n === 1) {
    return date;
  }
  return `${date}·${tripId.slice(0, 6)}`;
};

const buildTravelCharts = (input: TravelAnalyticsRawInput): TravelAnalyticsCharts => {
  const scan: TripAnalyticsScanResult = input.tripScan ?? createEmptyTripAnalyticsScan();
  const bucket: BucketListAnalyticsSummary = input.bucketListSummary ?? { total: 0, visited: 0, remaining: 0 };
  const dda = scan.delayDaypartAggregate ?? {
    morningSampleCount: 0,
    afternoonSampleCount: 0,
    morningDelaySum: 0,
    afternoonDelaySum: 0,
  };
  const daypartDelay = {
    morningSampleCount: dda.morningSampleCount,
    afternoonSampleCount: dda.afternoonSampleCount,
    averageMorningDelayMinutes: dda.morningSampleCount > 0 ? dda.morningDelaySum / dda.morningSampleCount : 0,
    averageAfternoonDelayMinutes: dda.afternoonSampleCount > 0 ? dda.afternoonDelaySum / dda.afternoonSampleCount : 0,
  };

  const sortedRows = [...scan.tripRows].sort((a, b) => a.tripEndDate.localeCompare(b.tripEndDate));
  const dateSeen = new Map<string, number>();

  const completionOverTime = sortedRows.map((r) => ({
    tripId: r.tripId,
    tripEndDate: r.tripEndDate,
    x: uniqueDateKey(r.tripEndDate, r.tripId, dateSeen),
    completionRate: Number.isFinite(r.completionRate) ? r.completionRate : 0,
    tripTitle: r.tripTitle,
  }));

  const delayDateSeen = new Map<string, number>();
  const delayOverTime = sortedRows.map((r) => {
    const delayRaw = r.reviewDelayMinutes ?? r.analyzedDelayMinutes;
    const delayMinutes = typeof delayRaw === "number" && Number.isFinite(delayRaw) ? Math.round(delayRaw) : 0;
    return {
      tripId: r.tripId,
      tripEndDate: r.tripEndDate,
      x: uniqueDateKey(r.tripEndDate, r.tripId, delayDateSeen),
      delayMinutes,
      tripTitle: r.tripTitle,
    };
  });

  const plannedVsCompleted = sortedRows.map((r) => ({
    key: r.tripId,
    tripTitle: r.tripTitle.length > 32 ? `${r.tripTitle.slice(0, 30)}…` : r.tripTitle,
    planned: r.plannedItems,
    completed: r.completedItems,
    skipped: r.skippedItems,
  }));

  const merged = scan.mergedCategoryRollups ?? [];
  const categoryStack = merged
    .filter((c) => c.total > 0)
    .slice(0, 16)
    .map((c) => ({
      name: (c.label || c.typeKey || "other").trim() || "other",
      done: Math.max(0, c.completed),
      skipped: Math.max(0, c.skipped),
      pending: Math.max(0, c.total - c.completed - c.skipped),
    }));

  const categoryGrandTotal = categoryStack.reduce((s, c) => s + c.done + c.skipped + c.pending, 0);

  const skipByCategory = merged
    .filter((c) => c.total >= SKIP_CATEGORY_MIN_TOTAL && c.skipped > 0)
    .map((c) => ({
      name: (c.label || c.typeKey || "other").trim() || "other",
      skipRate: c.total > 0 ? c.skipped / c.total : 0,
      skipped: c.skipped,
      total: c.total,
    }))
    .sort((a, b) => b.skipRate - a.skipRate);

  const countrySet = new Set<string>();
  const citySet = new Set<string>();
  const cumulativeCountries: TravelAnalyticsCharts["cumulativeCountries"] = [];
  const cumulativeCities: TravelAnalyticsCharts["cumulativeCities"] = [];
  const geoDateSeen = new Map<string, number>();
  for (const r of sortedRows) {
    r.countriesThisTrip.forEach((c) => {
      const k = c.trim().toLowerCase();
      if (k) {
        countrySet.add(k);
      }
    });
    r.citiesThisTrip.forEach((c) => {
      const k = c.trim().toLowerCase();
      if (k) {
        citySet.add(k);
      }
    });
    const x = uniqueDateKey(r.tripEndDate, r.tripId, geoDateSeen);
    cumulativeCountries.push({ tripId: r.tripId, tripEndDate: r.tripEndDate, x, count: countrySet.size, tripTitle: r.tripTitle });
    cumulativeCities.push({ tripId: r.tripId, tripEndDate: r.tripEndDate, x, count: citySet.size, tripTitle: r.tripTitle });
  }

  const paceAccuracy = sortedRows.map((r) => {
    const delayRaw = r.reviewDelayMinutes ?? r.analyzedDelayMinutes;
    const delayMinutes = typeof delayRaw === "number" && Number.isFinite(delayRaw) ? Math.round(delayRaw) : 0;
    return {
      tripId: r.tripId,
      tripTitle: r.tripTitle.length > 28 ? `${r.tripTitle.slice(0, 26)}…` : r.tripTitle,
      selected: r.selectedPace,
      actual: r.actualPace,
      completionRate: Number.isFinite(r.completionRate) ? r.completionRate : 0,
      delayMinutes,
    };
  });

  const styleDone = scan.styleDone;
  const styleSkipped = scan.styleSkipped;
  const maxDone = Math.max(1, ...STYLE_AXIS_KEYS.map((k) => styleDone[k] ?? 0));
  const fullMark = Math.max(1, Math.ceil(maxDone * 1.12));
  const styleRadar: TravelAnalyticsCharts["styleRadar"] = STYLE_AXIS_KEYS.map((axisKey) => ({
    axisKey,
    done: styleDone[axisKey] ?? 0,
    fullMark,
  }));

  const activeStyleAxes = STYLE_AXIS_KEYS.filter((k) => (styleDone[k] ?? 0) + (styleSkipped[k] ?? 0) > 0).length;

  const byAchievementKey = new Map(input.achievements.map((a) => [a.achievementKey, a]));
  const achievements: TravelAnalyticsCharts["achievements"] = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const doc = byAchievementKey.get(def.key);
    const target = Math.max(1, doc?.target ?? getAchievementDisplayTarget(def));
    const rawProgress = doc?.progress ?? 0;
    const progress = Math.min(Math.max(0, rawProgress), target);
    return {
      key: def.key,
      title: def.title,
      progress,
      target,
      unlocked: Boolean(doc?.unlocked),
    };
  });

  const lockedOrInProgress = achievements.filter((a) => !a.unlocked);

  const hasCompletionLine = sortedRows.length >= LINE_CHART_MIN_POINTS;
  const hasPlannedVsCompleted = sortedRows.length >= 1;
  const hasCategoryStack = categoryStack.length >= 1 && categoryGrandTotal >= CATEGORY_STACK_MIN_TOTAL_ITEMS;
  const hasSkipByCategory = skipByCategory.length >= 1;
  const hasDelayLine = sortedRows.length >= LINE_CHART_MIN_POINTS;
  const hasCumulativeGeo = sortedRows.length >= CUMULATIVE_GEO_LINE_MIN_TRIPS;
  const hasBucketChart = bucket.total > 0;
  const hasPaceAccuracy = sortedRows.length >= PACE_ACCURACY_MIN_TRIPS;
  const hasStyleRadar = activeStyleAxes >= STYLE_RADAR_MIN_ACTIVE_AXES && maxDone > 0;
  const hasAchievementBars = lockedOrInProgress.length > 0;

  return {
    thresholds: {
      lineChartsMinPoints: LINE_CHART_MIN_POINTS,
      skipCategoryMinTotal: SKIP_CATEGORY_MIN_TOTAL,
      styleRadarMinAxes: STYLE_RADAR_MIN_ACTIVE_AXES,
      hasCompletionLine,
      hasPlannedVsCompleted,
      hasCategoryStack,
      hasSkipByCategory,
      hasDelayLine,
      hasCumulativeGeo,
      hasBucketChart,
      hasPaceAccuracy,
      hasStyleRadar,
      hasAchievementBars,
    },
    daypartDelay,
    completionOverTime,
    plannedVsCompleted,
    categoryStack,
    skipByCategory,
    delayOverTime,
    cumulativeCountries,
    cumulativeCities,
    bucket,
    paceAccuracy,
    styleRadar,
    achievements: lockedOrInProgress.slice(0, 24),
  };
};

/**
 * Builds dashboard-ready analytics from repository inputs (deterministic, no AI).
 */
export const buildTravelAnalyticsBundle = (input: TravelAnalyticsRawInput): TravelAnalyticsBundle => {
  const summary = buildSummary(input);
  const hasRollups = input.tripPlanRollups.length > 0;
  const hasProfile = Boolean(input.behaviorProfile);
  const hasReviews = input.tripReviews.length > 0;
  const partial = !hasProfile || (input.metrics.completedTripsCount > 0 && !hasRollups);
  const isEmpty =
    summary.totalTrips === 0 &&
    summary.totalPlannedItems === 0 &&
    summary.countriesVisited === 0 &&
    summary.citiesVisited === 0 &&
    summary.bucketItemsCompleted === 0 &&
    summary.achievementsUnlocked === 0 &&
    !hasReviews;

  const completedTripTrend: TravelAnalyticsTrendPoint[] = hasRollups ? buildTrend(input) : [];
  const charts = buildTravelCharts(input);
  const insights = buildAnalyticsInsights({ summary, charts });
  const scanRows = (input.tripScan ?? createEmptyTripAnalyticsScan()).tripRows;
  const tripSummaries = [...scanRows]
    .sort((a, b) => a.tripEndDate.localeCompare(b.tripEndDate))
    .map((r) => ({
      tripId: r.tripId,
      tripTitle: r.tripTitle,
      tripEndDate: r.tripEndDate,
      countries: [...r.countriesThisTrip],
      cities: [...r.citiesThisTrip],
    }));

  return {
    summary,
    partial,
    isEmpty,
    behaviorProfile: input.behaviorProfile,
    categoryDoneCounts: { ...input.metrics.doneVisitCountByCategory },
    completedTripTrend,
    tripPlanRollups: input.tripPlanRollups,
    tripReviewCount: input.tripReviews.length,
    charts,
    insights,
    tripSummaries,
  };
};
