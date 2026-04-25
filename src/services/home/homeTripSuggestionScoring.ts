import dayjs from "dayjs";
import type { HomeTripSuggestionCandidate, HomeTripSuggestionKind, SuggestedTripBudgetEstimate } from "./homeTripSuggestionTypes";
import type { HomeSuggestionContext, TripHistoryEntry } from "./homeTripSuggestionContextBuilder";
import { isCuratedDestinationAvoided, isDestinationLocationAvoided, mergePreferenceProfile } from "../preferences/preferenceConstraintsService";

export type CuratedDestinationSeed = {
  country: string;
  city?: string;
  tags: string[];
  /** 1–12; trip idea shines in these months (northern hemisphere–centric labels in copy only). */
  seasonalMonths?: number[];
  sceneHints?: string[];
  genreHints?: string[];
  budgetStyles: Array<"lean" | "balanced" | "premium">;
  defaultDurationDays: number;
  dailySpendByStyle: { lean: number; balanced: number; premium: number };
};

/** Static catalogue — deterministic candidates only; copy is templated, not LLM-generated. */
export const CURATED_DESTINATION_SEEDS: CuratedDestinationSeed[] = [
  {
    country: "Portugal",
    city: "Lisbon",
    tags: ["coastal", "food", "urban"],
    seasonalMonths: [4, 5, 9, 10],
    sceneHints: ["indie", "singer-songwriter"],
    genreHints: ["indie", "folk", "alternative"],
    budgetStyles: ["lean", "balanced"],
    defaultDurationDays: 4,
    dailySpendByStyle: { lean: 85, balanced: 140, premium: 260 },
  },
  {
    country: "Japan",
    city: "Kyoto",
    tags: ["culture", "temples", "slow"],
    seasonalMonths: [3, 4, 10, 11],
    genreHints: ["ambient", "classical", "jazz"],
    budgetStyles: ["balanced", "premium"],
    defaultDurationDays: 5,
    dailySpendByStyle: { lean: 95, balanced: 160, premium: 320 },
  },
  {
    country: "Germany",
    city: "Berlin",
    tags: ["urban", "nightlife", "museums"],
    genreHints: ["electronic", "techno", "house", "edm"],
    sceneHints: ["club", "electronic"],
    budgetStyles: ["lean", "balanced"],
    defaultDurationDays: 4,
    dailySpendByStyle: { lean: 75, balanced: 130, premium: 240 },
  },
  {
    country: "Mexico",
    city: "Oaxaca",
    tags: ["food", "culture", "artisan"],
    seasonalMonths: [1, 2, 10, 11, 12],
    budgetStyles: ["lean", "balanced"],
    defaultDurationDays: 5,
    dailySpendByStyle: { lean: 65, balanced: 110, premium: 200 },
  },
  {
    country: "Canada",
    city: "Montreal",
    tags: ["festivals", "food", "urban"],
    genreHints: ["indie", "rock", "pop"],
    budgetStyles: ["balanced", "premium"],
    defaultDurationDays: 4,
    dailySpendByStyle: { lean: 90, balanced: 150, premium: 280 },
  },
  {
    country: "Italy",
    city: "Palermo",
    tags: ["food", "coastal", "history"],
    budgetStyles: ["lean", "balanced"],
    defaultDurationDays: 5,
    dailySpendByStyle: { lean: 80, balanced: 135, premium: 250 },
  },
  {
    country: "United States",
    city: "New Orleans",
    tags: ["music", "food", "nightlife"],
    genreHints: ["jazz", "funk", "soul", "blues"],
    sceneHints: ["live music", "jazz"],
    budgetStyles: ["balanced", "premium"],
    defaultDurationDays: 4,
    dailySpendByStyle: { lean: 100, balanced: 175, premium: 320 },
  },
  {
    country: "United Kingdom",
    city: "Manchester",
    tags: ["music", "urban", "industrial heritage"],
    genreHints: ["indie", "rock", "alternative"],
    budgetStyles: ["lean", "balanced"],
    defaultDurationDays: 3,
    dailySpendByStyle: { lean: 95, balanced: 155, premium: 270 },
  },
];

const destKey = (country: string, city?: string): string => `${country.trim().toLowerCase()}|${(city ?? "").trim().toLowerCase()}`;

const visitedCountrySet = (history: TripHistoryEntry[]): Set<string> => {
  const s = new Set<string>();
  for (const h of history) {
    for (const d of h.destinations) {
      s.add(d.country.trim().toLowerCase());
    }
  }
  return s;
};

const visitedDestKeys = (history: TripHistoryEntry[]): Set<string> => {
  const s = new Set<string>();
  for (const h of history) {
    for (const d of h.destinations) {
      s.add(destKey(d.country, d.city));
    }
  }
  return s;
};

const isBlockedHomeDestination = (ctx: HomeSuggestionContext, country: string, city?: string): boolean => {
  const profile = mergePreferenceProfile(ctx.preferenceProfile);
  return isDestinationLocationAvoided(profile, { country, city });
};

const budgetStyleOrDefault = (ctx: HomeSuggestionContext): "lean" | "balanced" | "premium" => {
  if (ctx.budget.dominantStyle !== "unknown") {
    return ctx.budget.dominantStyle;
  }
  return "balanced";
};

const estimateBudget = (
  ctx: HomeSuggestionContext,
  seed: CuratedDestinationSeed,
  durationDays: number,
): SuggestedTripBudgetEstimate => {
  const style = budgetStyleOrDefault(ctx);
  const daily =
    ctx.budget.avgDailySpend && ctx.budget.avgDailySpend > 0
      ? ctx.budget.avgDailySpend
      : seed.dailySpendByStyle[style];
  const min = Math.round(daily * durationDays * 0.85);
  const max = Math.round(daily * durationDays * 1.2);
  return { min, max, currency: ctx.budget.currency };
};

const estimateBudgetForPlace = (ctx: HomeSuggestionContext, durationDays: number): SuggestedTripBudgetEstimate => {
  if (ctx.budget.avgDailySpend && ctx.budget.minDaily && ctx.budget.maxDaily) {
    const mid = ctx.budget.avgDailySpend;
    return {
      min: Math.round(mid * durationDays * 0.9),
      max: Math.round(mid * durationDays * 1.15),
      currency: ctx.budget.currency,
    };
  }
  const seed = CURATED_DESTINATION_SEEDS.find((s) => s.country === "Portugal") ?? CURATED_DESTINATION_SEEDS[0]!;
  return estimateBudget(ctx, seed, durationDays);
};

const stableId = (kind: HomeTripSuggestionKind, country: string, city: string | undefined, salt: string): string => {
  const c = city?.trim() || "";
  return `wm-home:${kind}:${destKey(country, c)}:${salt.slice(0, 12)}`;
};

const topAffinityTags = (ctx: HomeSuggestionContext): string[] => {
  const aff = ctx.travelBehavior?.categoryAffinity ?? {};
  return Object.entries(aff)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k.toLowerCase());
};

const monthNow = (): number => dayjs().month() + 1;

const scoreSeasonal = (seed: CuratedDestinationSeed): number => {
  if (!seed.seasonalMonths?.length) {
    return 0.35;
  }
  const m = monthNow();
  return seed.seasonalMonths.includes(m) ? 0.95 : 0.4;
};

const genreSceneMatchScore = (ctx: HomeSuggestionContext, seed: CuratedDestinationSeed): number => {
  const genres = (ctx.music?.topGenres ?? []).map((g) => g.toLowerCase());
  const scenes = (ctx.music?.scenes ?? []).map((g) => g.toLowerCase());
  let hits = 0;
  for (const g of seed.genreHints ?? []) {
    if (genres.some((x) => x.includes(g.toLowerCase()))) {
      hits += 1;
    }
  }
  for (const s of seed.sceneHints ?? []) {
    if (scenes.some((x) => x.includes(s.toLowerCase()))) {
      hits += 1;
    }
  }
  if (hits === 0) {
    return 0.25;
  }
  return Math.min(1, 0.45 + hits * 0.18);
};

const flickSyncVibeScore = (ctx: HomeSuggestionContext, seed: CuratedDestinationSeed): number => {
  if (!ctx.flickSync.interestSignals.length) {
    return 0.2;
  }
  const blob = [...ctx.flickSync.topTitles, ...ctx.flickSync.interestSignals].join(" ").toLowerCase();
  let hits = 0;
  for (const tag of seed.tags) {
    if (blob.includes(tag)) {
      hits += 1;
    }
  }
  return hits > 0 ? Math.min(1, 0.35 + hits * 0.12) : 0.28;
};

const tagAffinityScore = (ctx: HomeSuggestionContext, seed: CuratedDestinationSeed): number => {
  const affTags = topAffinityTags(ctx);
  if (!affTags.length) {
    return 0.45;
  }
  let score = 0.35;
  for (const t of seed.tags) {
    if (affTags.some((a) => t.includes(a) || a.includes(t))) {
      score += 0.14;
    }
  }
  return Math.min(1, score);
};

const pushReturnTrips = (ctx: HomeSuggestionContext, out: HomeTripSuggestionCandidate[]): void => {
  for (const h of ctx.tripHistory) {
    if (h.executionScore < 0.55) {
      continue;
    }
    for (const d of h.destinations) {
      if (isBlockedHomeDestination(ctx, d.country, d.city)) {
        continue;
      }
      const duration = Math.max(3, Math.min(7, h.durationDays));
      const est = estimateBudgetForPlace(ctx, duration);
      const daysSince = ctx.lastTripDate ? dayjs().diff(dayjs(h.endedAt), "day") : 999;
      const recencyBoost = daysSince < 120 ? 0.12 : 0;
      const score = Math.min(1, h.executionScore * 0.72 + recencyBoost + (ctx.travelBehavior?.skipPatterns.averageCompletionRate ?? 0.5) * 0.15);
      out.push({
        id: stableId("return_trip", d.country, d.city, ctx.userId),
        type: "return_trip",
        title: `Back to ${d.city}`,
        destination: { city: d.city, country: d.country },
        durationDays: duration,
        estimatedBudget: est,
        reasoning: `You wrapped "${h.title}" with strong follow-through — a return visit fits your rhythm.`,
        confidence: score,
        sourceSignals: [
          `trip:${h.tripId}`,
          `execution_score:${h.executionScore.toFixed(2)}`,
          ...(daysSince < 180 ? [`last_visit_days:${daysSince}`] : []),
        ],
        score,
      });
    }
  }
};

const bucketListRowRank = (row: HomeSuggestionContext["bucketList"]["rows"][number]): number => {
  const days = dayjs().diff(dayjs(row.updatedAt), "day");
  const recency = Math.exp(-Math.max(0, days) / 95) * 0.36;
  const frequency = Math.min(1, Math.log1p(Math.max(1, row.touchCount)) / 4) * 0.22;
  const feas = row.feasibilityScore * 0.3;
  const pri = row.priority === "high" ? 0.12 : row.priority === "medium" ? 0.07 : 0.04;
  return Math.min(1, recency + frequency + feas + pri);
};

const pushBucketList = (ctx: HomeSuggestionContext, out: HomeTripSuggestionCandidate[]): void => {
  for (const row of ctx.bucketList.rows) {
    if (row.payloadType !== "destination" && row.payloadType !== "place") {
      continue;
    }
    if (!row.country) {
      continue;
    }
    if (isBlockedHomeDestination(ctx, row.country, row.city)) {
      continue;
    }
    const rank = bucketListRowRank(row);
    const duration = 4;
    const est = estimateBudgetForPlace(ctx, duration);
    out.push({
      id: stableId("bucket_list_push", row.country, row.city, row.id),
      type: "bucket_list_push",
      title: row.city ? `${row.city} — ${row.title}` : row.title,
      destination: { city: row.city, country: row.country },
      durationDays: duration,
      estimatedBudget: est,
      reasoning: `Structured bucket list (${row.payloadType})${row.priority === "high" ? " — high priority" : ""}; ranked by recency, how often you touch it, and trip feasibility.`,
      confidence: rank,
      sourceSignals: [
        `bucket_list:${row.id}`,
        `kind:${row.payloadType}`,
        `priority:${row.priority}`,
        `feasibility:${row.feasibilityScore.toFixed(2)}`,
        `touches:${row.touchCount}`,
      ],
      score: rank * 0.92,
    });
  }
};

const pushSimilarAndNew = (ctx: HomeSuggestionContext, out: HomeTripSuggestionCandidate[]): void => {
  const countries = visitedCountrySet(ctx.tripHistory);
  const vKeys = visitedDestKeys(ctx.tripHistory);
  const style = budgetStyleOrDefault(ctx);
  const monthScore = (seed: CuratedDestinationSeed) => scoreSeasonal(seed);

  for (const seed of CURATED_DESTINATION_SEEDS) {
    if (isCuratedDestinationAvoided(mergePreferenceProfile(ctx.preferenceProfile), seed)) {
      continue;
    }
    if (!seed.budgetStyles.includes(style) && ctx.budget.dominantStyle !== "unknown") {
      continue;
    }
    const key = destKey(seed.country, seed.city);
    const inCountry = countries.has(seed.country.trim().toLowerCase());
    const visitedExact = vKeys.has(key);

    if (visitedExact) {
      continue;
    }

    const duration = seed.defaultDurationDays;
    const budget = estimateBudget(ctx, seed, duration);

    if (inCountry) {
      const score =
        tagAffinityScore(ctx, seed) * 0.35 +
        genreSceneMatchScore(ctx, seed) * 0.25 +
        monthScore(seed) * 0.25 +
        (ctx.tasteConfidence > 0.4 ? ctx.tasteConfidence * 0.15 : 0.05);
      out.push({
        id: stableId("similar_trip", seed.country, seed.city, ctx.userId),
        type: "similar_trip",
        title: seed.city ? `${seed.city} — same country, new rhythm` : `${seed.country} — new stop`,
        destination: { city: seed.city, country: seed.country },
        durationDays: duration,
        estimatedBudget: budget,
        reasoning: `You already travel in ${seed.country}; ${seed.city ?? "this hub"} lines up with categories you actually finish.`,
        confidence: Math.min(1, score),
        sourceSignals: ["pattern:region_repeat", ...seed.tags.map((t) => `tag:${t}`)],
        score: Math.min(1, score),
      });
      continue;
    }

    const explorationScore =
      tagAffinityScore(ctx, seed) * 0.3 +
      genreSceneMatchScore(ctx, seed) * 0.2 +
      monthScore(seed) * 0.2 +
      flickSyncVibeScore(ctx, seed) * 0.2 +
      (ctx.travelBehavior ? 0.1 : 0.02);

    out.push({
      id: stableId("new_exploration", seed.country, seed.city, ctx.userId),
      type: "new_exploration",
      title: seed.city ? `First-time ${seed.city}` : `Explore ${seed.country}`,
      destination: { city: seed.city, country: seed.country },
      durationDays: duration,
      estimatedBudget: budget,
      reasoning: `New country for you, tuned to your typical ${style} spend band and pacing.`,
      confidence: Math.min(1, explorationScore),
      sourceSignals: ["pattern:new_region", ...seed.tags.map((t) => `tag:${t}`)],
      score: Math.min(1, explorationScore),
    });
  }
};

const pushSeasonalEventVibe = (ctx: HomeSuggestionContext, out: HomeTripSuggestionCandidate[]): void => {
  const style = budgetStyleOrDefault(ctx);
  for (const seed of CURATED_DESTINATION_SEEDS) {
    if (isCuratedDestinationAvoided(mergePreferenceProfile(ctx.preferenceProfile), seed)) {
      continue;
    }
    if (!seed.budgetStyles.includes(style) && ctx.budget.dominantStyle !== "unknown") {
      continue;
    }
    const key = destKey(seed.country, seed.city);
    if (visitedDestKeys(ctx.tripHistory).has(key)) {
      continue;
    }
    const seasonal = scoreSeasonal(seed);
    if (seasonal > 0.85) {
      const duration = seed.defaultDurationDays;
      const budget = estimateBudget(ctx, seed, duration);
      out.push({
        id: stableId("seasonal_opportunity", seed.country, seed.city, `${ctx.userId}-season`),
        type: "seasonal_opportunity",
        title: seed.city ? `${seed.city} — in season now` : `${seed.country} — seasonal window`,
        destination: { city: seed.city, country: seed.country },
        durationDays: duration,
        estimatedBudget: budget,
        reasoning: `Calendar signal: this destination tends to shine in the current month for the pace you prefer.`,
        confidence: seasonal * 0.88,
        sourceSignals: [`season_month:${monthNow()}`, ...seed.tags.map((t) => `tag:${t}`)],
        score: seasonal * 0.82,
      });
    }

    const gScore = genreSceneMatchScore(ctx, seed);
    if (gScore > 0.55 && (ctx.music?.topGenres.length ?? 0) > 0) {
      const duration = Math.max(3, seed.defaultDurationDays - 1);
      const budget = estimateBudget(ctx, seed, duration);
      out.push({
        id: stableId("event_driven", seed.country, seed.city, `${ctx.userId}-music`),
        type: "event_driven",
        title: seed.city ? `${seed.city} — live scene match` : `${seed.country} — gigs & rooms`,
        destination: { city: seed.city, country: seed.country },
        durationDays: duration,
        estimatedBudget: budget,
        reasoning: `Your top listening genres overlap cities known for that live circuit — worth scanning tickets before you plan dates.`,
        confidence: gScore * 0.9,
        sourceSignals: [...(ctx.music?.topGenres.slice(0, 3) ?? []).map((g) => `genre:${g}`)],
        score: gScore * 0.78,
      });
    }

    const v = flickSyncVibeScore(ctx, seed);
    if (v > 0.42 && ctx.flickSync.interestSignals.length > 0) {
      const duration = seed.defaultDurationDays;
      const budget = estimateBudget(ctx, seed, duration);
      out.push({
        id: stableId("vibe_based", seed.country, seed.city, `${ctx.userId}-flick`),
        type: "vibe_based",
        title: seed.city ? `${seed.city} — story-led escape` : `${seed.country} — mood-led trip`,
        destination: { city: seed.city, country: seed.country },
        durationDays: duration,
        estimatedBudget: budget,
        reasoning: `FlickSync favourites lean toward themes that pair well with ${seed.tags.join(", ")} stops — not random discovery, stacked taste.`,
        confidence: v * 0.85,
        sourceSignals: ctx.flickSync.interestSignals.slice(0, 4).map((s) => `flicksync:${s.slice(0, 40)}`),
        score: v * 0.72,
      });
    }
  }
};

const dedupeCandidates = (rows: HomeTripSuggestionCandidate[]): HomeTripSuggestionCandidate[] => {
  const best = new Map<string, HomeTripSuggestionCandidate>();
  for (const row of rows) {
    const k = `${row.type}|${destKey(row.destination.country, row.destination.city)}`;
    const prev = best.get(k);
    if (!prev || row.score > prev.score) {
      best.set(k, row);
    }
  }
  return [...best.values()];
};

/** One card per destination — keeps strongest signal type for that place. */
const dedupeByDestination = (rows: HomeTripSuggestionCandidate[]): HomeTripSuggestionCandidate[] => {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const best = new Map<string, HomeTripSuggestionCandidate>();
  for (const row of sorted) {
    const k = destKey(row.destination.country, row.destination.city);
    if (!best.has(k)) {
      best.set(k, row);
    }
  }
  return [...best.values()];
};

/**
 * Deterministic candidate generation + scoring. Returns up to `limit` rows sorted by score.
 * AI layer must not invent destinations; only reorder / trim / polish these rows.
 */
export const scoreHomeTripSuggestions = (ctx: HomeSuggestionContext, limit = 5): HomeTripSuggestionCandidate[] => {
  const raw: HomeTripSuggestionCandidate[] = [];
  pushReturnTrips(ctx, raw);
  pushBucketList(ctx, raw);
  pushSimilarAndNew(ctx, raw);
  pushSeasonalEventVibe(ctx, raw);

  const deduped = dedupeByDestination(dedupeCandidates(raw));
  return deduped.sort((a, b) => b.score - a.score).slice(0, limit);
};

export const buildCuratedFallbackSuggestions = (currency = "USD"): HomeTripSuggestionCandidate[] => {
  const ctxStub: HomeSuggestionContext = {
    userId: "guest",
    travelBehavior: null,
    tripHistory: [],
    flickSync: { topTitles: [], topMediaTypes: [], interestSignals: [] },
    music: null,
    budget: { avgDailySpend: null, minDaily: null, maxDaily: null, currency, dominantStyle: "balanced" },
    bucketList: { rows: [], savedDestinations: [], savedActivities: [] },
    preferenceProfile: { avoid: [], prefer: [] },
    lastTripDate: null,
    tasteConfidence: 0,
    personalizationAllowed: false,
  };
  const picks = CURATED_DESTINATION_SEEDS.slice(0, 4);
  return picks.map((seed, i) => {
    const duration = seed.defaultDurationDays;
    const budget = estimateBudget(ctxStub, seed, duration);
    return {
      id: stableId("new_exploration", seed.country, seed.city, `fallback-${i}`),
      type: "new_exploration" as const,
      title: seed.city ? `Editor pick: ${seed.city}` : `Editor pick: ${seed.country}`,
      destination: { city: seed.city, country: seed.country },
      durationDays: duration,
      estimatedBudget: budget,
      reasoning: `Curated starter trip while WanderMint learns your signals — swap in your dates when ready.`,
      confidence: 0.55,
      sourceSignals: ["fallback:curated", ...seed.tags.map((t) => `tag:${t}`)],
      score: 0.55 - i * 0.03,
    };
  });
};
