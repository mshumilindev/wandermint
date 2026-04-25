import type { AnalyticsInsight, TravelAnalyticsCharts, TravelAnalyticsSummary } from "./analytics.types";

export type { AnalyticsInsight } from "./analytics.types";

export type AnalyticsInsightsInput = {
  summary: TravelAnalyticsSummary;
  charts: TravelAnalyticsCharts;
};

const pct = (rate: number): string => {
  if (!Number.isFinite(rate)) {
    return "0%";
  }
  return `${Math.round(Math.min(1, Math.max(0, rate)) * 1000) / 10}%`;
};

const round1 = (n: number): string => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : "0.0");

type Scored = { priority: number; insight: AnalyticsInsight };

const completionSeriesSlope = (rates: readonly number[]): number => {
  const n = rates.length;
  if (n < 3) {
    return 0;
  }
  const xs = rates.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = rates.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * (rates[i] ?? 0), 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) {
    return 0;
  }
  return (n * sumXY - sumX * sumY) / denom;
};

const insightHighSkipRate = (summary: TravelAnalyticsSummary): Scored | null => {
  const planned = summary.totalPlannedItems;
  const rate = summary.averageSkipRate;
  if (planned < 12 || rate < 0.19) {
    return null;
  }
  return {
    priority: 95,
    insight: {
      id: "high_skip_rate",
      severity: "warning",
      title: "Elevated skip rate across your plans",
      description: `Portfolio skip rate is ${pct(rate)} (${summary.totalSkippedItems} skips on ${planned} planned stops). That usually means density, timing, or must-do ordering—not random bad luck.`,
      relatedMetric: "averageSkipRate",
    },
  };
};

const insightAfternoonDelays = (charts: TravelAnalyticsCharts): Scored | null => {
  const d = charts.daypartDelay;
  const m = d.averageMorningDelayMinutes;
  const a = d.averageAfternoonDelayMinutes;
  if (d.afternoonSampleCount < 2 || d.morningSampleCount < 1 || !Number.isFinite(m) || !Number.isFinite(a)) {
    return null;
  }
  if (a <= m + 18) {
    return null;
  }
  return {
    priority: 92,
    insight: {
      id: "afternoon_delay_pattern",
      severity: "warning",
      title: "Afternoon starts run later than mornings",
      description: `Across ${d.morningSampleCount} morning and ${d.afternoonSampleCount} afternoon completed starts, average lateness is ${round1(
        m,
      )} min in the morning vs ${round1(a)} min after midday (+${round1(a - m)} min). Consider anchoring must-sees before lunch.`,
      relatedMetric: "daypartDelay.averageAfternoonDelayMinutes",
    },
  };
};

const insightTopSkipCategory = (charts: TravelAnalyticsCharts): Scored | null => {
  const top = charts.skipByCategory[0];
  if (!top || top.total < 5 || top.skipRate < 0.32) {
    return null;
  }
  return {
    priority: 88,
    insight: {
      id: "top_skip_category",
      severity: "warning",
      title: `Highest skips: ${top.name}`,
      description: `${top.name} shows a ${pct(top.skipRate)} skip rate (${top.skipped} of ${top.total} stops in that category on finished trips).`,
      relatedMetric: "skipByCategory[0].skipRate",
    },
  };
};

const insightDensePlansWithSkips = (charts: TravelAnalyticsCharts): Scored | null => {
  const heavy = charts.plannedVsCompleted.filter((p) => p.planned >= 6 && p.planned > 0 && p.skipped / p.planned >= 0.24);
  if (heavy.length < 2) {
    return null;
  }
  const maxSkip = Math.max(...heavy.map((p) => p.skipped / p.planned));
  return {
    priority: 84,
    insight: {
      id: "dense_itineraries_skip",
      severity: "warning",
      title: "Repeated overplanning: dense trips, heavy skips",
      description: `On ${heavy.length} finished trips you planned ≥6 stops per trip yet skipped ≥24% of them (worst trip ~${pct(maxSkip)} skips). That pattern reads as systematic overpacking, not one-off fatigue.`,
      relatedMetric: "plannedVsCompleted",
    },
  };
};

const insightCompletionTrendUp = (charts: TravelAnalyticsCharts): Scored | null => {
  const series = charts.completionOverTime.map((p) => p.completionRate);
  if (series.length < 3) {
    return null;
  }
  const slope = completionSeriesSlope(series);
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;
  if (slope <= 0.035 && last < first + 0.07) {
    return null;
  }
  return {
    priority: 78,
    insight: {
      id: "completion_trend_up",
      severity: "positive",
      title: "Completion rate is trending up",
      description: `Across ${series.length} finished trips (chronological), completion moved from about ${pct(first)} to ${pct(last)} (linear slope ~${round1(slope)} completion points per trip index).`,
      relatedMetric: "completionOverTime",
    },
  };
};

const insightFoodCultureBias = (charts: TravelAnalyticsCharts): Scored | null => {
  const byKey = new Map(charts.styleRadar.map((r) => [r.axisKey, r.done]));
  const food = byKey.get("food") ?? 0;
  const culture = byKey.get("culture") ?? 0;
  const total = charts.styleRadar.reduce((s, r) => s + r.done, 0);
  if (total < 10) {
    return null;
  }
  const share = (food + culture) / total;
  if (share < 0.46) {
    return null;
  }
  return {
    priority: 72,
    insight: {
      id: "food_culture_preference",
      severity: "positive",
      title: "Strong food & culture footprint in completed stops",
      description: `${pct(share)} of ${total} style-tagged completions are food or culture (${food} food, ${culture} culture)—well above a balanced mix.`,
      relatedMetric: "styleRadar",
    },
  };
};

const insightBucketMomentum = (charts: TravelAnalyticsCharts): Scored | null => {
  const { total, visited, remaining } = charts.bucket;
  if (total < 4) {
    return null;
  }
  const share = visited / total;
  if (share < 0.52) {
    return null;
  }
  if (total >= 5 && remaining <= 1 && share >= 0.85) {
    return null;
  }
  return {
    priority: 68,
    insight: {
      id: "bucket_list_momentum",
      severity: "positive",
      title: "Bucket list completion is ahead of the halfway mark",
      description: `You have marked ${visited} of ${total} saved bucket places visited (${pct(share)}), leaving ${charts.bucket.remaining} open—based on your current bucket list snapshot.`,
      relatedMetric: "bucket.visited",
    },
  };
};

const insightBucketClosingOut = (charts: TravelAnalyticsCharts): Scored | null => {
  const { total, visited, remaining } = charts.bucket;
  if (total < 5 || remaining > 1 || visited / total < 0.85) {
    return null;
  }
  return {
    priority: 74,
    insight: {
      id: "bucket_list_closing_out",
      severity: "positive",
      title: "Bucket list is almost fully cleared",
      description: `Only ${remaining} of ${total} saved places are still unvisited (${visited} done, ${pct(visited / total)} complete).`,
      relatedMetric: "bucket.remaining",
    },
  };
};

const insightPaceMismatchSlower = (charts: TravelAnalyticsCharts): Scored | null => {
  const hits = charts.paceAccuracy.filter((p) => p.selected === "fast" && p.actual === "slow");
  if (hits.length < 2) {
    return null;
  }
  return {
    priority: 62,
    insight: {
      id: "pace_fast_selected_slow_actual",
      severity: "info",
      title: "“Fast” trips often behave like slower paces",
      description: `On ${hits.length} finished trips you chose a fast pace, but inferred pacing from completion/delay looked slower—worth defaulting to balanced plans or fewer anchors per day.`,
      relatedMetric: "paceAccuracy",
    },
  };
};

const insightHighAverageDelay = (summary: TravelAnalyticsSummary, charts: TravelAnalyticsCharts): Scored | null => {
  if (charts.delayOverTime.length < 2 || summary.averageDelayMinutes < 22) {
    return null;
  }
  return {
    priority: 58,
    insight: {
      id: "high_average_delay",
      severity: "warning",
      title: "Average start delays are elevated",
      description: `Your blended average delay signal is ${summary.averageDelayMinutes} minutes across finished trips—based on the same rollup as trip reviews and plan analysis.`,
      relatedMetric: "averageDelayMinutes",
    },
  };
};

const insightCompletionTrendDown = (charts: TravelAnalyticsCharts): Scored | null => {
  const series = charts.completionOverTime.map((p) => p.completionRate);
  if (series.length < 4) {
    return null;
  }
  const slope = completionSeriesSlope(series);
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;
  if (slope >= -0.04 || last > first - 0.03) {
    return null;
  }
  return {
    priority: 45,
    insight: {
      id: "completion_trend_down",
      severity: "info",
      title: "Completion has softened on recent finished trips",
      description: `Chronological completion went from about ${pct(first)} to ${pct(last)} over ${series.length} trips (linear slope ~${round1(slope)} per trip index).`,
      relatedMetric: "completionOverTime",
    },
  };
};

const insightCategoryBacklog = (charts: TravelAnalyticsCharts): Scored | null => {
  const rows = charts.categoryStack
    .map((c) => ({
      ...c,
      total: c.done + c.skipped + c.pending,
      pendingShare: c.done + c.skipped + c.pending > 0 ? c.pending / (c.done + c.skipped + c.pending) : 0,
    }))
    .filter((c) => c.total >= 6 && c.pendingShare >= 0.38);
  const top = rows.sort((a, b) => b.pendingShare - a.pendingShare)[0];
  if (!top) {
    return null;
  }
  return {
    priority: 50,
    insight: {
      id: "category_pending_backlog",
      severity: "info",
      title: `Pending backlog in “${top.name}”`,
      description: `In ${top.name}, ${top.pending} of ${top.total} stops are still pending (${pct(top.pendingShare)}) after your finished trips—often sightseeing categories that stayed “nice to have”.`,
      relatedMetric: "categoryStack",
    },
  };
};

/**
 * Deterministic, rule-based insights from summary + chart payloads (no network / no AI).
 * Returns up to five items, ordered by internal priority.
 */
export const buildAnalyticsInsights = (input: AnalyticsInsightsInput): AnalyticsInsight[] => {
  const { summary, charts } = input;
  const candidates: Scored[] = [];

  const push = (s: Scored | null): void => {
    if (s) {
      candidates.push(s);
    }
  };

  push(insightHighSkipRate(summary));
  push(insightAfternoonDelays(charts));
  push(insightTopSkipCategory(charts));
  push(insightDensePlansWithSkips(charts));
  push(insightCompletionTrendUp(charts));
  push(insightFoodCultureBias(charts));
  push(insightBucketMomentum(charts));
  push(insightBucketClosingOut(charts));
  push(insightPaceMismatchSlower(charts));
  push(insightHighAverageDelay(summary, charts));
  push(insightCategoryBacklog(charts));
  push(insightCompletionTrendDown(charts));

  const seen = new Set<string>();
  const out: AnalyticsInsight[] = [];
  for (const { insight } of candidates.sort((a, b) => b.priority - a.priority)) {
    if (seen.has(insight.id)) {
      continue;
    }
    seen.add(insight.id);
    out.push(insight);
    if (out.length >= 5) {
      break;
    }
  }
  return out;
};
