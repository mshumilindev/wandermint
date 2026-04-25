import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { PlaceExperienceMemory } from "../../entities/place-memory/model";
import { nowIso } from "../../services/firebase/timestampMapper";
import type { TasteRawSignals, TravelTasteProfile } from "./travelTaste.types";

const AFFINITY_CAP = 1;
const MIN_TRIPS_FOR_FULL_WEIGHT = 2;
const MIN_EVENTS_FOR_CONFIDENCE = 10;
const TARGET_EVENTS_FOR_CONFIDENCE = 28;
const TARGET_TRIPS_FOR_CONFIDENCE = 4;
const HIGH_RATING_THRESHOLD = 4;
const PER_TRIP_CATEGORY_CAP = 14;
const SEARCH_QUERY_MIN_LEN = 2;
const SEARCH_QUERY_MAX_LEN = 80;

export const emptyTasteRawSignals = (): TasteRawSignals => ({
  completedCategoryCounts: {},
  skippedCategoryCounts: {},
  cuisinePositive: {},
  cuisineNegative: {},
  experiencePositive: {},
  experienceNegative: {},
  savedPlaceCategoryBoosts: {},
  removedOrAvoidCategoryHits: {},
  searchQueryCounts: {},
  highlyRatedCategoryHits: {},
  dislikedTypeHits: {},
  contributingTripIds: [],
  totalScoringEvents: 0,
});

const bump = (map: Record<string, number>, key: string, delta: number, cap?: number): void => {
  const k = key.trim().toLowerCase();
  if (!k) {
    return;
  }
  const next = (map[k] ?? 0) + delta;
  map[k] = cap !== undefined ? Math.min(cap, next) : next;
};

const normalizeCuisineToken = (raw: string): string | null => {
  const t = raw.trim().toLowerCase();
  if (t.length < 2 || t.length > 48) {
    return null;
  }
  return t;
};

const foodLikeCategories = new Set(["food", "drink", "cafe"]);

/**
 * Maps block text into coarse cuisine buckets for affinity (best-effort; no external NLP).
 */
const inferCuisineHintsFromBlock = (block: ActivityBlock, itineraryCategory: string): string[] => {
  if (!foodLikeCategories.has(itineraryCategory)) {
    return [];
  }
  const vocab = [
    "italian",
    "japanese",
    "french",
    "mexican",
    "indian",
    "thai",
    "chinese",
    "korean",
    "vietnamese",
    "spanish",
    "greek",
    "seafood",
    "vegetarian",
    "vegan",
    "steak",
    "sushi",
    "ramen",
    "bbq",
    "bakery",
    "wine",
    "coffee",
    "brunch",
    "tapas",
  ];
  const haystack = `${block.title} ${block.description} ${block.tags.join(" ")}`.toLowerCase();
  const hits = vocab.filter((w) => haystack.includes(w));
  return hits.length > 0 ? hits : [];
};

const experienceHintsFromBlock = (block: ActivityBlock): string[] => {
  const haystack = `${block.title} ${block.description} ${block.tags.join(" ")}`.toLowerCase();
  const hints: string[] = [];
  if (haystack.includes("guided") || haystack.includes("tour")) {
    hints.push("guided_tour");
  }
  if (haystack.includes("night") || haystack.includes("evening")) {
    hints.push("evening_experience");
  }
  if (haystack.includes("market") || haystack.includes("bazaar")) {
    hints.push("markets");
  }
  if (haystack.includes("hike") || haystack.includes("trail")) {
    hints.push("outdoor_active");
  }
  if (haystack.includes("spa") || haystack.includes("wellness")) {
    hints.push("wellness");
  }
  if (haystack.includes("live music") || haystack.includes("concert") || haystack.includes("jazz")) {
    hints.push("live_music");
  }
  return hints;
};

const addTripCap = (value: number): number => Math.min(PER_TRIP_CATEGORY_CAP, value);

/**
 * Aggregates completion / skip / rating signals from saved day plans for one trip.
 * Per-trip caps avoid one vacation dominating the taste model (Rule 1).
 */
export const accumulateDayPlanSignals = (
  days: DayPlan[],
  tripId: string,
  normalizeCategory: (block: ActivityBlock) => string,
  into: TasteRawSignals,
): void => {
  if (!tripId.trim() || days.length === 0) {
    return;
  }
  if (!into.contributingTripIds.includes(tripId)) {
    into.contributingTripIds.push(tripId);
  }

  for (const day of days) {
    for (const block of day.blocks) {
      if (block.type === "transfer" || block.type === "rest") {
        continue;
      }
      const cat = normalizeCategory(block);
      const status = block.completionStatus;
      const isDone = status === "done" || status === "unconfirmed";
      const isSkip = status === "skipped" || status === "missed";

      if (isDone) {
        bump(into.completedCategoryCounts, cat, addTripCap(1));
        into.totalScoringEvents += 1;
        const cuisines = inferCuisineHintsFromBlock(block, cat);
        for (const c of cuisines) {
          bump(into.cuisinePositive, c, addTripCap(1));
          into.totalScoringEvents += 1;
        }
        for (const x of experienceHintsFromBlock(block)) {
          bump(into.experiencePositive, x, addTripCap(1));
          into.totalScoringEvents += 1;
        }
        const r = block.place?.rating;
        if (r !== undefined && r >= HIGH_RATING_THRESHOLD) {
          bump(into.highlyRatedCategoryHits, cat, addTripCap(1));
          into.totalScoringEvents += 1;
        }
      } else if (isSkip) {
        bump(into.skippedCategoryCounts, cat, addTripCap(1));
        into.totalScoringEvents += 1;
        const cuisines = inferCuisineHintsFromBlock(block, cat);
        for (const c of cuisines) {
          bump(into.cuisineNegative, c, addTripCap(1));
          into.totalScoringEvents += 1;
        }
        for (const x of experienceHintsFromBlock(block)) {
          bump(into.experienceNegative, x, addTripCap(1));
          into.totalScoringEvents += 1;
        }
      }
    }
  }
};

export const accumulatePlaceMemorySignals = (memories: PlaceExperienceMemory[], into: TasteRawSignals): void => {
  for (const m of memories) {
    const cat = (m.experienceCategory ?? m.tags[0] ?? "place").trim().toLowerCase() || "place";
    if (m.isFavorite) {
      bump(into.savedPlaceCategoryBoosts, cat, 2);
      bump(into.completedCategoryCounts, cat, 1);
      into.totalScoringEvents += 3;
    }
    if (m.notInterested) {
      bump(into.removedOrAvoidCategoryHits, cat, 2);
      bump(into.dislikedTypeHits, cat, 2);
      into.totalScoringEvents += 4;
    }
    const skips = Math.min(6, m.skippedCount ?? 0);
    if (skips > 0) {
      bump(into.skippedCategoryCounts, cat, skips);
      into.totalScoringEvents += skips;
    }
    const completes = Math.min(8, m.completedCount ?? 0);
    if (completes > 0) {
      bump(into.completedCategoryCounts, cat, completes);
      into.totalScoringEvents += completes;
    }
  }
};

export const mergeSearchQueriesIntoSignals = (queries: string[], into: TasteRawSignals): void => {
  for (const raw of queries) {
    const q = raw.trim().toLowerCase();
    if (q.length < SEARCH_QUERY_MIN_LEN || q.length > SEARCH_QUERY_MAX_LEN) {
      continue;
    }
    bump(into.searchQueryCounts, q, 1);
    into.totalScoringEvents += 1;
  }
};

const ratioAffinity = (positive: number, negative: number): number => {
  const p = positive + 0.75;
  const n = negative + 0.75;
  const raw = (p - n) / (p + n);
  return Math.max(-AFFINITY_CAP, Math.min(AFFINITY_CAP, raw * 1.15));
};

const buildAffinityMap = (
  positive: Record<string, number>,
  negative: Record<string, number>,
  singleTripDampen: number,
): Record<string, number> => {
  const keys = new Set([...Object.keys(positive), ...Object.keys(negative)]);
  const out: Record<string, number> = {};
  for (const k of keys) {
    const aff = ratioAffinity(positive[k] ?? 0, negative[k] ?? 0) * singleTripDampen;
    if (Math.abs(aff) >= 0.04) {
      out[k] = Math.max(-AFFINITY_CAP, Math.min(AFFINITY_CAP, aff));
    }
  }
  return out;
};

const topKeysByScore = (scores: Record<string, number>, take: number): string[] =>
  Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([k]) => k);

export const computeTravelTasteProfile = (userId: string, raw: TasteRawSignals): TravelTasteProfile => {
  const uniqueTrips = raw.contributingTripIds.length;
  const singleTripDampen = uniqueTrips >= MIN_TRIPS_FOR_FULL_WEIGHT ? 1 : 0.42;

  const categoryAffinity = buildAffinityMap(raw.completedCategoryCounts, raw.skippedCategoryCounts, singleTripDampen);
  for (const [cat, boost] of Object.entries(raw.savedPlaceCategoryBoosts)) {
    const w = Math.min(0.35, boost * 0.06) * singleTripDampen;
    categoryAffinity[cat] = Math.min(AFFINITY_CAP, (categoryAffinity[cat] ?? 0) + w);
  }
  for (const [cat, hit] of Object.entries(raw.removedOrAvoidCategoryHits)) {
    const w = Math.min(0.55, hit * 0.08) * singleTripDampen;
    categoryAffinity[cat] = Math.max(-AFFINITY_CAP, (categoryAffinity[cat] ?? 0) - w);
  }
  for (const [cat, hit] of Object.entries(raw.highlyRatedCategoryHits)) {
    const w = Math.min(0.4, hit * 0.07) * singleTripDampen;
    categoryAffinity[cat] = Math.min(AFFINITY_CAP, (categoryAffinity[cat] ?? 0) + w);
  }

  const cuisineAffinity = buildAffinityMap(raw.cuisinePositive, raw.cuisineNegative, singleTripDampen);
  const experienceAffinity = buildAffinityMap(raw.experiencePositive, raw.experienceNegative, singleTripDampen);

  const searchBoost = Object.fromEntries(
    Object.entries(raw.searchQueryCounts)
      .filter(([, c]) => c >= 3)
      .map(([q, c]) => [q, Math.min(0.5, (c - 2) * 0.06) * singleTripDampen]),
  );
  for (const [q, w] of Object.entries(searchBoost)) {
    experienceAffinity[q] = Math.min(AFFINITY_CAP, (experienceAffinity[q] ?? 0) + w);
  }

  let confidence = Math.min(1, raw.totalScoringEvents / TARGET_EVENTS_FOR_CONFIDENCE) * Math.min(1, uniqueTrips / TARGET_TRIPS_FOR_CONFIDENCE);
  if (uniqueTrips < MIN_TRIPS_FOR_FULL_WEIGHT) {
    confidence *= 0.62;
  }
  if (raw.totalScoringEvents < MIN_EVENTS_FOR_CONFIDENCE) {
    confidence *= raw.totalScoringEvents / MIN_EVENTS_FOR_CONFIDENCE;
  }
  confidence = Math.max(0, Math.min(1, confidence));

  const favoritePatterns = [
    ...topKeysByScore(raw.completedCategoryCounts, 4).map((k) => `frequent_complete:${k}`),
    ...topKeysByScore(raw.savedPlaceCategoryBoosts, 3).map((k) => `saved_place_boost:${k}`),
    ...topKeysByScore(raw.highlyRatedCategoryHits, 3).map((k) => `high_rating:${k}`),
  ].slice(0, 12);

  const dislikedPatterns = [
    ...topKeysByScore(raw.skippedCategoryCounts, 4).map((k) => `frequent_skip:${k}`),
    ...topKeysByScore(raw.removedOrAvoidCategoryHits, 3).map((k) => `avoid_signal:${k}`),
    ...topKeysByScore(raw.dislikedTypeHits, 4).map((k) => `disliked_type:${k}`),
  ].slice(0, 12);

  return {
    userId,
    categoryAffinity,
    cuisineAffinity,
    experienceAffinity,
    dislikedPatterns,
    favoritePatterns,
    confidence,
    updatedAt: nowIso(),
  };
};

/** Extra transition cost from taste (positive number = worse / less preferred). */
export const tasteTransitionCostDelta = (itineraryCategory: string, profile: TravelTasteProfile | null | undefined): number => {
  if (!profile || profile.confidence < 0.08) {
    return 0;
  }
  const key = itineraryCategory.trim().toLowerCase();
  const aff = profile.categoryAffinity[key] ?? 0;
  return -aff * 110 * profile.confidence;
};

/**
 * Weak learned signal for this category → prefer reserving it as an "exploration" slot (Rule 5).
 */
export const isTasteExplorationCategory = (itineraryCategory: string, profile: TravelTasteProfile | null | undefined): boolean => {
  if (!profile) {
    return true;
  }
  const key = itineraryCategory.trim().toLowerCase();
  const aff = Math.abs(profile.categoryAffinity[key] ?? 0) * profile.confidence;
  return aff < 0.2;
};

export const defaultTasteExplorationMix = 0.2;
