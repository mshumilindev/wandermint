import type { TravelBehaviorProfile, TravelBehaviorSelectedPace } from "../user-behavior/travelBehavior.types";
import type { AchievementProgressDocument } from "../achievements/achievementRepository";
import type { TripReviewDocument } from "../../services/firebase/repositories/tripReviewsRepository";
import type { UserAchievementMetrics } from "../achievements/achievementEngine";
import type { CategoryRollup } from "../trip-review/tripReviewCalculator";

/** High-level aggregates for the personal analytics dashboard (no raw coordinates). */
export type TravelAnalyticsSummary = {
  totalTrips: number;
  completedTrips: number;
  totalPlannedItems: number;
  totalCompletedItems: number;
  totalSkippedItems: number;
  averageCompletionRate: number;
  averageSkipRate: number;
  averageDelayMinutes: number;
  countriesVisited: number;
  citiesVisited: number;
  bucketItemsCompleted: number;
  achievementsUnlocked: number;
};

/** Per completed trip — counts derived from stored {@link TripPlanItem} lists (lat/lng stripped at source). */
export type TripPlanItemRollup = {
  tripId: string;
  /** Trip end date for chronological ordering (YYYY-MM-DD). */
  tripEndDate: string;
  plannedItems: number;
  completedItems: number;
  skippedItems: number;
};

export type StyleAxisKey = "food" | "culture" | "nature" | "events" | "nightlife" | "shopping" | "hidden_gems" | "custom";

export const STYLE_AXIS_KEYS: readonly StyleAxisKey[] = [
  "food",
  "culture",
  "nature",
  "events",
  "nightlife",
  "shopping",
  "hidden_gems",
  "custom",
];

export type TripAnalyticsTripRow = {
  tripId: string;
  tripTitle: string;
  tripEndDate: string;
  plannedItems: number;
  completedItems: number;
  skippedItems: number;
  completionRate: number;
  reviewDelayMinutes: number | null;
  analyzedDelayMinutes: number;
  selectedPace: TravelBehaviorSelectedPace;
  actualPace: TravelBehaviorSelectedPace;
  countriesThisTrip: string[];
  citiesThisTrip: string[];
};

/** Rolled up from per-trip delay samples (morning vs afternoon starts) for analytics insights. */
export type DelayDaypartAggregate = {
  morningSampleCount: number;
  afternoonSampleCount: number;
  morningDelaySum: number;
  afternoonDelaySum: number;
};

export type TripAnalyticsScanResult = {
  rollups: TripPlanItemRollup[];
  tripRows: TripAnalyticsTripRow[];
  mergedCategoryRollups: CategoryRollup[];
  styleDone: Record<StyleAxisKey, number>;
  styleSkipped: Record<StyleAxisKey, number>;
  delayDaypartAggregate: DelayDaypartAggregate;
};

const emptyDaypart = (): DelayDaypartAggregate => ({
  morningSampleCount: 0,
  afternoonSampleCount: 0,
  morningDelaySum: 0,
  afternoonDelaySum: 0,
});

export const createEmptyTripAnalyticsScan = (): TripAnalyticsScanResult => ({
  rollups: [],
  tripRows: [],
  mergedCategoryRollups: [],
  delayDaypartAggregate: emptyDaypart(),
  styleDone: {
    food: 0,
    culture: 0,
    nature: 0,
    events: 0,
    nightlife: 0,
    shopping: 0,
    hidden_gems: 0,
    custom: 0,
  },
  styleSkipped: {
    food: 0,
    culture: 0,
    nature: 0,
    events: 0,
    nightlife: 0,
    shopping: 0,
    hidden_gems: 0,
    custom: 0,
  },
});

export type TravelAnalyticsTrendPoint = {
  label: string;
  completionRate: number;
  delayMinutes: number;
};

export type BucketListAnalyticsSummary = {
  total: number;
  visited: number;
  remaining: number;
};

export type TravelAnalyticsChartThresholds = {
  lineChartsMinPoints: number;
  skipCategoryMinTotal: number;
  styleRadarMinAxes: number;
  hasCompletionLine: boolean;
  hasPlannedVsCompleted: boolean;
  hasCategoryStack: boolean;
  hasSkipByCategory: boolean;
  hasDelayLine: boolean;
  hasCumulativeGeo: boolean;
  hasBucketChart: boolean;
  hasPaceAccuracy: boolean;
  hasStyleRadar: boolean;
  hasAchievementBars: boolean;
};

export type TravelAnalyticsCharts = {
  thresholds: TravelAnalyticsChartThresholds;
  /** Average lateness of starts by day-part, pooled across finished trips (same signals as trip review). */
  daypartDelay: {
    morningSampleCount: number;
    afternoonSampleCount: number;
    averageMorningDelayMinutes: number;
    averageAfternoonDelayMinutes: number;
  };
  completionOverTime: Array<{ tripId: string; tripEndDate: string; x: string; completionRate: number; tripTitle: string }>;
  plannedVsCompleted: Array<{ key: string; tripTitle: string; planned: number; completed: number; skipped: number }>;
  categoryStack: Array<{ name: string; done: number; skipped: number; pending: number }>;
  skipByCategory: Array<{ name: string; skipRate: number; skipped: number; total: number }>;
  delayOverTime: Array<{ tripId: string; tripEndDate: string; x: string; delayMinutes: number; tripTitle: string }>;
  cumulativeCountries: Array<{ tripId: string; tripEndDate: string; x: string; count: number; tripTitle: string }>;
  cumulativeCities: Array<{ tripId: string; tripEndDate: string; x: string; count: number; tripTitle: string }>;
  bucket: BucketListAnalyticsSummary;
  paceAccuracy: Array<{
    tripId: string;
    tripTitle: string;
    selected: TravelBehaviorSelectedPace;
    actual: TravelBehaviorSelectedPace;
    completionRate: number;
    delayMinutes: number;
  }>;
  styleRadar: Array<{ axisKey: StyleAxisKey; done: number; fullMark: number }>;
  achievements: Array<{ key: string; title: string; progress: number; target: number; unlocked: boolean }>;
};

export type TravelAnalyticsRawInput = {
  userId: string;
  behaviorProfile: TravelBehaviorProfile | null;
  tripReviews: TripReviewDocument[];
  achievements: AchievementProgressDocument[];
  metrics: UserAchievementMetrics;
  tripPlanRollups: TripPlanItemRollup[];
  tripScan: TripAnalyticsScanResult;
  bucketListSummary: BucketListAnalyticsSummary;
};

/** Short-form insight for the analytics dashboard (copy is generated deterministically). */
export type AnalyticsInsight = {
  id: string;
  severity: "info" | "warning" | "positive";
  title: string;
  description: string;
  /** Machine-readable metric id backing this insight (e.g. `averageSkipRate`). */
  relatedMetric?: string;
};

/** Per finished trip — used for dashboard date/country filters (no coordinates). */
export type AnalyticsTripSummaryRow = {
  tripId: string;
  tripTitle: string;
  tripEndDate: string;
  countries: string[];
  cities: string[];
};

export type TravelAnalyticsBundle = {
  summary: TravelAnalyticsSummary;
  /** True when some sources are missing (e.g. no travel-behavior profile yet). */
  partial: boolean;
  /** True when there is no meaningful activity to chart yet. */
  isEmpty: boolean;
  /** True when the user has turned off personal analytics — no server reads ran for this payload. */
  personalAnalyticsOptedOut?: boolean;
  behaviorProfile: TravelBehaviorProfile | null;
  categoryDoneCounts: Record<string, number>;
  completedTripTrend: TravelAnalyticsTrendPoint[];
  tripPlanRollups: TripPlanItemRollup[];
  tripReviewCount: number;
  charts: TravelAnalyticsCharts;
  /** Deterministic, metric-backed highlights (max 5). */
  insights: AnalyticsInsight[];
  /** Finished trips with country labels for dashboard filters. */
  tripSummaries: AnalyticsTripSummaryRow[];
};
