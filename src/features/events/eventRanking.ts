import type { EventSearchResult } from "./eventSearch.types";
import { toDateOnly } from "./eventSearch.types";

export type EventRankingMode = "upcoming" | "past";

export type EventRankingContext = {
  query: string;
  mode: EventRankingMode;
  tripCity?: string;
  tripCountry?: string;
  tripStartDate?: string;
  tripEndDate?: string;
};

const canonicalDedupeKey = (e: EventSearchResult): string => {
  const title = e.title.trim().toLowerCase();
  const venue = e.venueName.trim().toLowerCase();
  const day = toDateOnly(e.startDate);
  return `${title}|${day}|${venue}|${e.city.trim().toLowerCase()}`;
};

const splitSources = (s: string): string[] =>
  s
    .split(/\s*\+\s*|\s*,\s*|\s+&\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

const mergeDuplicates = (a: EventSearchResult, b: EventSearchResult): EventSearchResult => {
  const primary = a.confidenceScore >= b.confidenceScore ? a : b;
  const secondary = primary === a ? b : a;
  const sources = new Set([...splitSources(primary.source), ...splitSources(secondary.source)]);
  return {
    ...primary,
    confidenceScore: Math.max(a.confidenceScore, b.confidenceScore),
    source: [...sources].join(" + "),
    imageUrl: primary.imageUrl ?? secondary.imageUrl,
    coordinates: primary.coordinates ?? secondary.coordinates,
    endDate: primary.endDate ?? secondary.endDate,
    ticketUrl: primary.ticketUrl ?? secondary.ticketUrl,
    sourceUrl: primary.sourceUrl ?? secondary.sourceUrl,
    providerEventId: primary.providerEventId ?? secondary.providerEventId,
    startTime: primary.startTime ?? secondary.startTime,
    timezone: primary.timezone ?? secondary.timezone,
    lineup: primary.lineup ?? secondary.lineup,
    description: primary.description ?? secondary.description,
  };
};

/**
 * Collapses the same real-world event coming from multiple APIs.
 */
export const dedupeEventSearchResults = (items: readonly EventSearchResult[]): EventSearchResult[] => {
  const map = new Map<string, EventSearchResult>();
  for (const item of items) {
    const k = canonicalDedupeKey(item);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...item });
    } else {
      map.set(k, mergeDuplicates(existing, item));
    }
  }
  return [...map.values()];
};

const tokenize = (q: string): string[] =>
  q
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]+/gi, ""))
    .filter((t) => t.length > 1);

export const dateRangesOverlap = (
  aStart: string,
  aEnd: string | undefined,
  bStart: string,
  bEnd: string | undefined,
): boolean => {
  const as = toDateOnly(aStart);
  const ae = toDateOnly(aEnd ?? aStart);
  const bs = toDateOnly(bStart);
  const be = toDateOnly(bEnd ?? bStart);
  return as <= be && bs <= ae;
};

/** Overlap in calendar days (inclusive) between event span and trip span; 0 if none. */
export const tripEventOverlapDays = (
  eventStart: string,
  eventEnd: string | undefined,
  tripStart?: string,
  tripEnd?: string,
): number => {
  if (!tripStart?.trim() || !tripEnd?.trim()) {
    return 0;
  }
  const es = toDateOnly(eventStart);
  const ee = toDateOnly(eventEnd ?? eventStart);
  const ts = toDateOnly(tripStart);
  const te = toDateOnly(tripEnd);
  if (es > te || ts > ee) {
    return 0;
  }
  const start = es > ts ? es : ts;
  const end = ee < te ? ee : te;
  const a = parseYmdUtc(start);
  const b = parseYmdUtc(end);
  if (!a || !b) {
    return 0;
  }
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
};

const parseYmdUtc = (s: string): Date | null => {
  const d = toDateOnly(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) {
    return null;
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};

/**
 * Ranking score (higher is better). Used as secondary sort after date ordering.
 */
export const scoreEventForContext = (e: EventSearchResult, ctx: EventRankingContext): number => {
  const q = ctx.query.toLowerCase().trim();
  const title = e.title.toLowerCase();
  const artistTokens = tokenize(q);
  let score = e.confidenceScore * 4;

  if (q && title === q) {
    score += 120;
  } else if (q && title.includes(q)) {
    score += 70;
  } else if (artistTokens.length > 0) {
    const hits = artistTokens.filter((t) => title.includes(t)).length;
    score += hits * 18;
    if (hits === artistTokens.length && artistTokens.length >= 2) {
      score += 25;
    }
  }

  const city = ctx.tripCity?.toLowerCase().trim() ?? "";
  if (city) {
    const ec = e.city.toLowerCase();
    if (ec === city) {
      score += 42;
    } else if (ec.includes(city) || city.includes(ec)) {
      score += 28;
    }
  }

  const country = ctx.tripCountry?.toLowerCase().trim() ?? "";
  if (country) {
    const eco = e.country.toLowerCase();
    if (eco === country || eco.includes(country) || country.includes(eco)) {
      score += 32;
    }
  }

  if (ctx.mode === "past" && ctx.tripStartDate && ctx.tripEndDate) {
    const overlap = tripEventOverlapDays(e.startDate, e.endDate, ctx.tripStartDate, ctx.tripEndDate);
    if (overlap > 0) {
      score += 55 + Math.min(overlap, 6) * 6;
    }
  }

  return score;
};

const compareYmd = (a: string, b: string): number => a.localeCompare(b);

/**
 * Upcoming: primary sort start date ascending; tie-break by ranking score descending.
 */
export const sortUpcomingSearchResults = (items: readonly EventSearchResult[], ctx: EventRankingContext): EventSearchResult[] =>
  [...items].sort((x, y) => {
    const cx = compareYmd(toDateOnly(x.startDate), toDateOnly(y.startDate));
    if (cx !== 0) {
      return cx;
    }
    return scoreEventForContext(y, ctx) - scoreEventForContext(x, ctx);
  });

/**
 * Backfill: chronological order within the trip; tie-break by score descending.
 */
export const sortBackfillSearchResults = (items: readonly EventSearchResult[], ctx: EventRankingContext): EventSearchResult[] =>
  [...items].sort((x, y) => {
    const cx = compareYmd(toDateOnly(x.startDate), toDateOnly(y.startDate));
    if (cx !== 0) {
      return cx;
    }
    return scoreEventForContext(y, ctx) - scoreEventForContext(x, ctx);
  });
