import dayjs from "dayjs";
import type { TravelAnalyticsBundle, TravelAnalyticsCharts, TravelAnalyticsChartThresholds, TravelAnalyticsSummary } from "./analytics.types";

export type AnalyticsTimeRange = "all" | "12m" | "6m";

/** Sentinel for “every country” in the filter control. */
export const ANALYTICS_COUNTRY_ALL = "all";

const LINE_CHART_MIN_POINTS = 2;
const CUMULATIVE_GEO_LINE_MIN_TRIPS = 2;
const PACE_ACCURACY_MIN_TRIPS = 2;

const uniqueDateKey = (date: string, tripId: string, seen: Map<string, number>): string => {
  const n = (seen.get(date) ?? 0) + 1;
  seen.set(date, n);
  if (n === 1) {
    return date;
  }
  return `${date}·${tripId.slice(0, 6)}`;
};

const dateCutoffIso = (range: Exclude<AnalyticsTimeRange, "all">): string =>
  range === "12m" ? dayjs().subtract(12, "month").format("YYYY-MM-DD") : dayjs().subtract(6, "month").format("YYYY-MM-DD");

const rowMatchesCountry = (countries: readonly string[], countryKey: string): boolean => {
  const want = countryKey.trim().toLowerCase();
  if (!want) {
    return true;
  }
  return countries.some((c) => c.trim().toLowerCase() === want);
};

const rowMatchesTime = (tripEndDate: string, timeRange: AnalyticsTimeRange): boolean => {
  if (timeRange === "all") {
    return true;
  }
  return tripEndDate >= dateCutoffIso(timeRange);
};

const mergeTripThresholds = (base: TravelAnalyticsChartThresholds, next: Partial<TravelAnalyticsChartThresholds>): TravelAnalyticsChartThresholds => ({
  ...base,
  ...next,
});

const recomputeFilteredSummary = (
  base: TravelAnalyticsSummary,
  rollups: TravelAnalyticsBundle["tripPlanRollups"],
  paceRows: TravelAnalyticsBundle["charts"]["paceAccuracy"],
  cityCount: number,
  countryCount: number,
): TravelAnalyticsSummary => {
  const planned = rollups.reduce((a, r) => a + r.plannedItems, 0);
  const completed = rollups.reduce((a, r) => a + r.completedItems, 0);
  const skipped = rollups.reduce((a, r) => a + r.skippedItems, 0);
  const avgCompletion = planned > 0 ? completed / planned : 0;
  const avgSkip = planned > 0 ? skipped / planned : 0;
  const delays = paceRows.map((p) => p.delayMinutes).filter((n) => Number.isFinite(n));
  const avgDelay = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : base.averageDelayMinutes;

  return {
    ...base,
    completedTrips: rollups.length,
    totalPlannedItems: planned,
    totalCompletedItems: completed,
    totalSkippedItems: skipped,
    averageCompletionRate: Number.isFinite(avgCompletion) ? avgCompletion : 0,
    averageSkipRate: Number.isFinite(avgSkip) ? avgSkip : 0,
    averageDelayMinutes: avgDelay,
    citiesVisited: cityCount,
    countriesVisited: countryCount,
  };
};

/**
 * Applies time and country filters to trip-scoped chart series and summary rollups.
 * Category / style / skip / bucket / achievements / day-part aggregates stay all-time (see UI note).
 */
export const buildFilteredAnalyticsBundle = (
  base: TravelAnalyticsBundle,
  timeRange: AnalyticsTimeRange,
  countryFilter: string,
): TravelAnalyticsBundle => {
  const raw = countryFilter.trim();
  const countryKey =
    raw.length === 0 || raw.toLowerCase() === ANALYTICS_COUNTRY_ALL ? ANALYTICS_COUNTRY_ALL : raw.toLowerCase();

  if (timeRange === "all" && countryKey === ANALYTICS_COUNTRY_ALL) {
    return base;
  }

  const summaries = base.tripSummaries;
  const allowedIds = new Set(
    summaries
      .filter((s) => rowMatchesTime(s.tripEndDate, timeRange) && (countryKey === ANALYTICS_COUNTRY_ALL || rowMatchesCountry(s.countries, countryKey)))
      .map((s) => s.tripId),
  );

  const ch = base.charts;
  const tBase = ch.thresholds;

  if (allowedIds.size === 0) {
    const emptyTripCharts: TravelAnalyticsCharts = {
      ...ch,
      completionOverTime: [],
      delayOverTime: [],
      plannedVsCompleted: [],
      cumulativeCountries: [],
      cumulativeCities: [],
      paceAccuracy: [],
      thresholds: mergeTripThresholds(tBase, {
        hasCompletionLine: false,
        hasPlannedVsCompleted: false,
        hasDelayLine: false,
        hasCumulativeGeo: false,
        hasPaceAccuracy: false,
      }),
    };
    return {
      ...base,
      charts: emptyTripCharts,
      summary: recomputeFilteredSummary(base.summary, [], [], 0, 0),
    };
  }

  const completionOverTime = ch.completionOverTime.filter((r) => allowedIds.has(r.tripId));
  const delayOverTime = ch.delayOverTime.filter((r) => allowedIds.has(r.tripId));
  const plannedVsCompleted = ch.plannedVsCompleted.filter((r) => allowedIds.has(r.key));
  const paceAccuracy = ch.paceAccuracy.filter((r) => allowedIds.has(r.tripId));

  const cSeen = new Map<string, number>();
  const completionRemapped = completionOverTime.map((r) => ({
    ...r,
    x: uniqueDateKey(r.tripEndDate, r.tripId, cSeen),
  }));
  const dSeen = new Map<string, number>();
  const delayRemapped = delayOverTime.map((r) => ({
    ...r,
    x: uniqueDateKey(r.tripEndDate, r.tripId, dSeen),
  }));

  const filteredSummaries = summaries.filter((s) => allowedIds.has(s.tripId)).sort((a, b) => a.tripEndDate.localeCompare(b.tripEndDate));
  const countrySet = new Set<string>();
  const citySet = new Set<string>();
  const gSeen = new Map<string, number>();
  const cumulativeCountries: TravelAnalyticsCharts["cumulativeCountries"] = [];
  const cumulativeCities: TravelAnalyticsCharts["cumulativeCities"] = [];
  for (const s of filteredSummaries) {
    s.countries.forEach((c) => {
      const k = c.trim().toLowerCase();
      if (k) {
        countrySet.add(k);
      }
    });
    s.cities.forEach((c) => {
      const k = c.trim().toLowerCase();
      if (k) {
        citySet.add(k);
      }
    });
    const x = uniqueDateKey(s.tripEndDate, s.tripId, gSeen);
    cumulativeCountries.push({ tripId: s.tripId, tripEndDate: s.tripEndDate, x, count: countrySet.size, tripTitle: s.tripTitle });
    cumulativeCities.push({ tripId: s.tripId, tripEndDate: s.tripEndDate, x, count: citySet.size, tripTitle: s.tripTitle });
  }

  const rollups = base.tripPlanRollups.filter((r) => allowedIds.has(r.tripId));
  const nextSummary = recomputeFilteredSummary(base.summary, rollups, paceAccuracy, citySet.size, countrySet.size);

  const nextCharts: TravelAnalyticsCharts = {
    ...ch,
    completionOverTime: completionRemapped,
    delayOverTime: delayRemapped,
    plannedVsCompleted,
    cumulativeCountries,
    cumulativeCities,
    paceAccuracy,
    thresholds: mergeTripThresholds(tBase, {
      hasCompletionLine: completionRemapped.length >= LINE_CHART_MIN_POINTS,
      hasPlannedVsCompleted: plannedVsCompleted.length >= 1,
      hasDelayLine: delayRemapped.length >= LINE_CHART_MIN_POINTS,
      hasCumulativeGeo: filteredSummaries.length >= CUMULATIVE_GEO_LINE_MIN_TRIPS,
      hasPaceAccuracy: paceAccuracy.length >= PACE_ACCURACY_MIN_TRIPS,
    }),
  };

  return {
    ...base,
    charts: nextCharts,
    summary: nextSummary,
  };
};

export const uniqueCountryFilterOptions = (base: TravelAnalyticsBundle): { value: string; label: string }[] => {
  const m = new Map<string, string>();
  for (const s of base.tripSummaries) {
    for (const c of s.countries) {
      const k = c.trim().toLowerCase();
      if (k && !m.has(k)) {
        m.set(k, c.trim());
      }
    }
  }
  return [...m.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));
};
