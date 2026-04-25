import { analyzeCompletedTrip, type TripReviewComputation } from "./tripReviewCalculator";
import type { CompletedTrip, TripReview } from "./tripReview.types";

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

const formatDateList = (dates: readonly string[]): string => {
  if (dates.length === 0) {
    return "";
  }
  if (dates.length === 1) {
    return dates[0] ?? "";
  }
  if (dates.length === 2) {
    const a = dates[0] ?? "";
    const b = dates[1] ?? "";
    return `${a} and ${b}`;
  }
  const last = dates.at(-1) ?? "";
  return `${dates.slice(0, -1).join(", ")}, and ${last}`;
};

const heaviestDaysOverlapOverloaded = (c: TripReviewComputation): boolean =>
  c.heaviestDayKeys.some((d) => c.overloadedDays.includes(d));

const buildCategoryContrastInsight = (c: TripReviewComputation): string | null => {
  const roll = c.categoryRollups.filter((r) => r.total >= 2);
  if (roll.length < 2) {
    return null;
  }

  const strongComplete = roll
    .filter((r) => r.completed / r.total >= 0.66 && r.completed >= 1)
    .sort((a, b) => b.completed / b.total - a.completed / a.total);
  const weakComplete = roll
    .filter((r) => r.skipped >= 1 && r.skipped / r.total >= 0.35)
    .sort((a, b) => b.skipped / b.total - a.skipped / a.total);

  const a = strongComplete[0];
  const b = weakComplete.find((x) => x.typeKey !== a?.typeKey);
  if (!a || !b) {
    return null;
  }

  const packed =
    c.overloadedDays.length > 0 && (heaviestDaysOverlapOverloaded(c) || c.maxItemsOnSingleDay >= 7);
  const tail = packed
    ? "—often on your busiest days."
    : "—worth reordering or trimming when time is tight.";

  return `You usually complete ${a.label.toLowerCase()} stops but skipped several ${b.label.toLowerCase()} ${tail}`;
};

const buildInsights = (c: TripReviewComputation): string[] => {
  const out: string[] = [];
  const push = (s: string) => {
    if (s && !out.includes(s)) {
      out.push(s);
    }
  };

  if (c.skippedMustTitles.length > 0) {
    const names = c.skippedMustTitles.slice(0, 2).join("”, “");
    const more = c.skippedMustTitles.length > 2 ? ` (+${c.skippedMustTitles.length - 2} more)` : "";
    push(
      `Must-see items were skipped (“${names}”${more}). Check whether those days had too many competing stops or late starts.`,
    );
  }

  if (c.overloadedDays.length > 0) {
    push(
      `On ${formatDateList(c.overloadedDays)}, you skipped more than 30% of planned stops—those days were likely over-packed.`,
    );
  }

  const contrast = buildCategoryContrastInsight(c);
  if (contrast) {
    push(contrast);
  }

  const morn = mean(c.morningDelayMinutes);
  const aft = mean(c.afternoonDelayMinutes);
  if (c.afternoonDelayMinutes.length >= 2 && c.morningDelayMinutes.length >= 1 && aft > morn + 18) {
    push(
      "You tend to lose time after lunch compared with the morning, so future plans should place must-see locations earlier in the day.",
    );
  }

  if (c.mealInsufficient) {
    push(
      `Food and rest coverage looked thin for the amount of sightseeing (longest gap between meal-like stops about ${Math.round(c.maxMealGapMinutes / 60)}h)—add explicit breaks or shorter meal windows closer together.`,
    );
  }

  if (c.maxItemsOnSingleDay >= 8 && c.skipRate > 0.22) {
    push(
      "Fast mode seems too dense for your actual travel style: your heaviest same-day itineraries matched higher skip rates.",
    );
  } else if (c.maxItemsOnSingleDay >= 7 && heaviestDaysOverlapOverloaded(c)) {
    push(
      "Days with the most back-to-back items were the same days with the heaviest skipping—fewer stops per day may match how you actually move.",
    );
  }

  if (c.averageEndDelayMinutes > 22 && c.delaySamples.length >= 2) {
    push(
      "Completed stops often ran past their planned end time, which stacks into the rest of the day—trim durations or add buffer before the next anchor.",
    );
  }

  if (c.averageDelayMinutes > 25 && c.delaySamples.length >= 3 && c.skipRate > 0.15) {
    push(
      "Late starts were common on finished stops; combined with skips, the schedule may have been optimistic—pad morning handoffs or reduce the first-half count.",
    );
  }

  return out.slice(0, 7);
};

/**
 * Post-trip analysis: planned vs completed, skip-heavy days, category patterns,
 * meal/rest sufficiency, and actionable insights.
 */
export const buildTripReview = (trip: CompletedTrip): TripReview => {
  const c = analyzeCompletedTrip(trip);
  return {
    completionRate: c.completionRate,
    skipRate: c.skipRate,
    averageDelayMinutes: c.averageDelayMinutes,
    mostSkippedCategories: c.mostSkippedCategories,
    overloadedDays: c.overloadedDays,
    insights: buildInsights(c),
  };
};
