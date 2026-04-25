import type { ActivityBlock } from "../../entities/activity/model";
import type { TravelMemory } from "../../entities/travel-memory/model";
import type { Trip } from "../../entities/trip/model";
import { isTravelMemoryEligibleForAggregates, syntheticTripIdFromMemoryId } from "../travel-stats/travelMemoryTripEquivalence";
import { tripDaysRepository } from "../../services/firebase/repositories/tripDaysRepository";
import type { TripReviewDocument } from "../../services/firebase/repositories/tripReviewsRepository";
import {
  buildCompletedTripSummaryFromDayPlans,
  inferBehaviorPaceFromTripSummary,
  mapTripPreferencesPaceToSelectedPace,
} from "../user-behavior/travelBehaviorCalculator";
import { buildCompletedTripForTripReviewFromDayPlans } from "../trip-review/buildCompletedTripFromDayPlans";
import { analyzeCompletedTrip, type CategoryRollup } from "../trip-review/tripReviewCalculator";
import type { StyleAxisKey, TripAnalyticsScanResult, TripAnalyticsTripRow, TripPlanItemRollup } from "./analytics.types";

const memoryStyleToStyleAxis = (style: TravelMemory["style"]): StyleAxisKey => {
  switch (style) {
    case "food":
      return "food";
    case "culture":
      return "culture";
    case "nature":
      return "nature";
    case "nightlife":
      return "nightlife";
    case "rest":
    case "mixed":
    default:
      return "custom";
  }
};

const TRIP_DONE: Trip["status"][] = ["completed", "partially_completed"];

const norm = (s: string): string => s.trim().toLowerCase();

const isCountableBlock = (block: ActivityBlock): boolean => block.completionStatus !== "cancelled_by_replan";

const segmentCountry = (trip: Trip, segmentId: string): string | undefined =>
  trip.tripSegments.find((s) => s.id === segmentId)?.country?.trim();

const emptyStyleCounts = (): Record<StyleAxisKey, number> => ({
  food: 0,
  culture: 0,
  nature: 0,
  events: 0,
  nightlife: 0,
  shopping: 0,
  hidden_gems: 0,
  custom: 0,
});

/** Single primary style bucket per block to avoid double-counting in radar-style charts. */
export const primaryStyleAxisForBlock = (block: ActivityBlock): StyleAxisKey => {
  const hay = `${block.type} ${block.category} ${block.title}`.toLowerCase();
  const rules: Array<[StyleAxisKey, RegExp]> = [
    ["food", /\b(meal|food|restaurant|dining|coffee|café|cafe|brunch|lunch|dinner|wine|beer|tasting|bakery|bistro|snack)\b/],
    ["culture", /\b(museum|gallery|historic|cathedral|church|art|monument|castle|palace|architecture|exhibit|heritage|library)\b/],
    ["nature", /\b(park|hike|trail|beach|mountain|garden|lake|forest|national park|outdoor|scenic|viewpoint)\b/],
    ["events", /\b(concert|festival|show|theatre|theater|performance|game|match|tournament|expo)\b/],
    ["nightlife", /\b(nightlife|club|dj|bar crawl|late night|evening out)\b/],
    ["shopping", /\b(shop|shopping|market|mall|boutique|souvenir|retail)\b/],
    ["hidden_gems", /\b(local secret|off the beaten|hidden gem|neighborhood|locals|quaint|alley)\b/],
  ];
  for (const [axis, re] of rules) {
    if (re.test(hay)) {
      return axis;
    }
  }
  return "custom";
};

const mergeCategoryRollup = (into: Map<string, CategoryRollup>, next: CategoryRollup): void => {
  const key = next.typeKey.trim().toLowerCase() || "other";
  const prev = into.get(key);
  if (!prev) {
    into.set(key, {
      typeKey: key,
      label: next.label,
      total: next.total,
      completed: next.completed,
      skipped: next.skipped,
    });
    return;
  }
  into.set(key, {
    ...prev,
    total: prev.total + next.total,
    completed: prev.completed + next.completed,
    skipped: prev.skipped + next.skipped,
  });
};

export const scanTripAnalyticsData = async (
  trips: Trip[],
  tripReviews: TripReviewDocument[],
  travelMemories: readonly TravelMemory[] = [],
): Promise<TripAnalyticsScanResult> => {
  const reviewDelayByTripId = new Map(tripReviews.map((d) => [d.tripId, d.review.averageDelayMinutes]));

  const eligible = trips.filter((t) => TRIP_DONE.includes(t.status)).sort((a, b) => a.dateRange.end.localeCompare(b.dateRange.end));

  const rollups: TripPlanItemRollup[] = [];
  const tripRows: TripAnalyticsTripRow[] = [];
  const categoryMerge = new Map<string, CategoryRollup>();
  const styleDone = emptyStyleCounts();
  const styleSkipped = emptyStyleCounts();
  const delayDaypartAggregate = {
    morningSampleCount: 0,
    afternoonSampleCount: 0,
    morningDelaySum: 0,
    afternoonDelaySum: 0,
  };

  for (const trip of eligible) {
    const days = await tripDaysRepository.getTripDays(trip.id);
    const ct = buildCompletedTripForTripReviewFromDayPlans(days, trip);
    if (!ct || ct.plannedItems.length === 0) {
      continue;
    }

    const analysis = analyzeCompletedTrip(ct);
    for (const v of analysis.morningDelayMinutes) {
      delayDaypartAggregate.morningSampleCount += 1;
      delayDaypartAggregate.morningDelaySum += v;
    }
    for (const v of analysis.afternoonDelayMinutes) {
      delayDaypartAggregate.afternoonSampleCount += 1;
      delayDaypartAggregate.afternoonDelaySum += v;
    }
    for (const cr of analysis.categoryRollups) {
      mergeCategoryRollup(categoryMerge, cr);
    }

    const summary = buildCompletedTripSummaryFromDayPlans(days, trip);
    const selectedPace = mapTripPreferencesPaceToSelectedPace(trip.preferences.pace);
    const actualPace = inferBehaviorPaceFromTripSummary(summary);
    const planned = ct.plannedItems.length;
    const completed = ct.completedItemIds.length;
    const skipped = ct.skippedItemIds.length;
    const completionRate = planned > 0 ? completed / planned : 0;

    const countriesThisTrip = new Set<string>();
    const citiesThisTrip = new Set<string>();

    for (const day of days) {
      const doneBlocks = day.blocks.filter((b) => b.completionStatus === "done" || b.completionStatus === "unconfirmed");
      if (doneBlocks.length === 0) {
        continue;
      }
      const city = day.cityLabel?.trim();
      if (city) {
        citiesThisTrip.add(norm(city));
      }
      const countryRaw = day.countryLabel?.trim() || segmentCountry(trip, day.segmentId);
      if (countryRaw) {
        countriesThisTrip.add(norm(countryRaw));
      }
    }

    for (const day of days) {
      for (const block of day.blocks) {
        if (!isCountableBlock(block)) {
          continue;
        }
        const axis = primaryStyleAxisForBlock(block);
        const done = block.completionStatus === "done" || block.completionStatus === "unconfirmed";
        const skippedB = block.completionStatus === "skipped" || block.completionStatus === "missed";
        if (done) {
          styleDone[axis] += 1;
        } else if (skippedB) {
          styleSkipped[axis] += 1;
        }
      }
    }

    rollups.push({
      tripId: trip.id,
      tripEndDate: trip.dateRange.end,
      plannedItems: planned,
      completedItems: completed,
      skippedItems: skipped,
    });

    tripRows.push({
      tripId: trip.id,
      tripTitle: trip.title.trim() || trip.destination.trim() || trip.id,
      tripEndDate: trip.dateRange.end,
      plannedItems: planned,
      completedItems: completed,
      skippedItems: skipped,
      completionRate: Number.isFinite(completionRate) ? completionRate : 0,
      reviewDelayMinutes: (() => {
        const v = reviewDelayByTripId.get(trip.id);
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      })(),
      analyzedDelayMinutes: Number.isFinite(analysis.averageDelayMinutes) ? analysis.averageDelayMinutes : 0,
      selectedPace,
      actualPace,
      countriesThisTrip: [...countriesThisTrip],
      citiesThisTrip: [...citiesThisTrip],
    });
  }

  for (const mem of travelMemories) {
    if (!isTravelMemoryEligibleForAggregates(mem)) {
      continue;
    }
    const axis = memoryStyleToStyleAxis(mem.style);
    styleDone[axis] += 1;
    const tripId = syntheticTripIdFromMemoryId(mem.id);
    const cityN = norm(mem.city.trim());
    const countryN = norm(mem.country.trim());
    rollups.push({
      tripId,
      tripEndDate: mem.endDate,
      plannedItems: 1,
      completedItems: 1,
      skippedItems: 0,
    });
    tripRows.push({
      tripId,
      tripTitle: mem.geoLabel?.trim() || `${mem.city.trim()}, ${mem.country.trim()}`,
      tripEndDate: mem.endDate,
      plannedItems: 1,
      completedItems: 1,
      skippedItems: 0,
      completionRate: 1,
      reviewDelayMinutes: null,
      analyzedDelayMinutes: 0,
      selectedPace: "balanced",
      actualPace: "balanced",
      countriesThisTrip: [countryN],
      citiesThisTrip: [cityN],
    });
  }

  return {
    rollups,
    tripRows,
    mergedCategoryRollups: [...categoryMerge.values()].sort((a, b) => b.completed - a.completed),
    styleDone,
    styleSkipped,
    delayDaypartAggregate,
  };
};
