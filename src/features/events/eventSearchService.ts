import type { EventLookupEventType, EventLookupResult } from "../../entities/events/eventLookup.model";
import { ANALYTICS_EVENTS } from "../observability/analyticsEvents";
import { logAnalyticsEvent } from "../observability/appLogger";
import { searchEventsWithCache } from "../../services/events/eventLookupService";
import { searchSongkickEvents } from "../../services/events/providers/songkickProvider";
import { searchTicketmasterEvents, type TicketmasterEventHit } from "../../services/events/providers/ticketmasterProvider";
import { dateRangesOverlap, dedupeEventSearchResults, sortUpcomingSearchResults, type EventRankingContext } from "./eventRanking";
import type { EventSearchResult, EventSearchResultType, TripEventSearchContext } from "./eventSearch.types";
import { isMultiDayFestivalResult, toDateOnly } from "./eventSearch.types";

const inferSearchType = (r: EventLookupResult): EventSearchResultType => {
  switch (r.eventType) {
    case "concert":
      return "concert";
    case "festival":
    case "multi_day_festival":
      return "festival";
    case "venue_event":
      return "show";
    default:
      break;
  }
  const hay = `${r.title} ${r.artistName ?? ""} ${r.festivalName ?? ""}`.toLowerCase();
  if (/\b(nfl|nba|mlb|nhl|mls|soccer|football|rugby|tennis|stadium|world cup|\bvs\.?)\b/i.test(hay)) {
    return "sports";
  }
  return "other";
};

export const lookupResultToSearchResult = (r: EventLookupResult): EventSearchResult => ({
  id: r.id,
  title: r.title,
  type: inferSearchType(r),
  venueName: r.venueName?.trim() || "Unknown venue",
  city: r.city?.trim() || "",
  country: (r.country?.trim() || r.countryCode?.trim() || "").trim(),
  startDate: r.startDate?.trim() ?? "",
  endDate: r.endDate?.trim() || undefined,
  coordinates: r.coordinates,
  imageUrl: r.imageUrl,
  source: r.provider,
  confidenceScore: r.confidence,
  providerEventId: r.providerEventId,
  sourceUrl: r.sourceUrl,
  ticketUrl: r.ticketUrl,
  startTime: r.startTime,
  timezone: r.timezone,
  lineup: r.lineup,
  description: r.description,
});

const parsePrimaryProvider = (source: string): EventLookupResult["provider"] => {
  const first = source.split(/\s*\+\s*/)[0]?.trim().toLowerCase() ?? "";
  if (first === "ticketmaster" || first === "bandsintown" || first === "songkick" || first === "manual") {
    return first;
  }
  return "fallback";
};

const searchTypeToLookupEventType = (e: EventSearchResult): EventLookupEventType => {
  if (e.type === "concert") {
    return "concert";
  }
  if (e.type === "festival") {
    return isMultiDayFestivalResult(e) ? "multi_day_festival" : "festival";
  }
  if (e.type === "show") {
    return "venue_event";
  }
  return "unknown";
};

/** Bridges ranked rows back to the existing anchor / memory apply pipeline. */
export const searchResultToLookupResult = (e: EventSearchResult): EventLookupResult => ({
  id: e.id,
  provider: parsePrimaryProvider(e.source),
  providerEventId: e.providerEventId,
  title: e.title,
  eventType: searchTypeToLookupEventType(e),
  venueName: e.venueName === "Unknown venue" ? undefined : e.venueName,
  city: e.city || undefined,
  country: e.country.length > 2 ? e.country : undefined,
  countryCode: e.country.length === 2 ? e.country.toUpperCase() : undefined,
  coordinates: e.coordinates,
  startDate: e.startDate || undefined,
  endDate: e.endDate,
  startTime: e.startTime,
  timezone: e.timezone,
  imageUrl: e.imageUrl,
  sourceUrl: e.sourceUrl,
  ticketUrl: e.ticketUrl,
  lineup: e.lineup,
  description: e.description,
  confidence: e.confidenceScore,
  artistName: e.type === "concert" ? extractArtistHint(e.title) : undefined,
  festivalName: e.type === "festival" ? extractFestivalHint(e.title) : undefined,
});

const extractArtistHint = (title: string): string | undefined => {
  const m = /^(.+?)\s+at\s+/i.exec(title.trim());
  return m?.[1]?.trim() || undefined;
};

const extractFestivalHint = (title: string): string | undefined => {
  const t = title.trim();
  return t.length > 0 ? t : undefined;
};

export type UpcomingSearchParams = {
  query: string;
  context?: TripEventSearchContext;
  limit?: number;
  signal?: AbortSignal;
};

const utcTodayYmd = (): string => new Date().toISOString().slice(0, 10);

const ticketmasterHitToSearchResult = (e: TicketmasterEventHit): EventSearchResult => ({
  id: e.id,
  title: e.title,
  type: "concert",
  venueName: e.venueName,
  city: e.city,
  country: e.country,
  startDate: e.startDate,
  coordinates: e.coordinates,
  imageUrl: e.imageUrl,
  source: "ticketmaster",
  confidenceScore: 0.82,
  providerEventId: e.providerEventId,
  sourceUrl: e.sourceUrl,
  ticketUrl: e.ticketUrl,
  startTime: e.startTime,
});

/** When trip window (+ optional city/country) is set, drop events that cannot apply to this itinerary. */
const filterEventsToTripContext = (items: readonly EventSearchResult[], ctx?: TripEventSearchContext): EventSearchResult[] => {
  if (!ctx?.tripStartDate?.trim() || !ctx.tripEndDate?.trim()) {
    return [...items];
  }
  const ts = toDateOnly(ctx.tripStartDate);
  const te = toDateOnly(ctx.tripEndDate);
  return items.filter((e) => {
    if (!e.startDate?.trim() || !dateRangesOverlap(e.startDate, e.endDate, ts, te)) {
      return false;
    }
    if (ctx.tripCity?.trim()) {
      const tc = ctx.tripCity.toLowerCase().trim();
      const ec = e.city.toLowerCase().trim();
      if (!ec || (!ec.includes(tc) && !tc.includes(ec))) {
        return false;
      }
    }
    if (ctx.tripCountry?.trim()?.length === 2) {
      const code = ctx.tripCountry.trim().toUpperCase();
      if (e.country && e.country.toUpperCase() !== code) {
        return false;
      }
    }
    return true;
  });
};

/**
 * Upcoming search: future events only, ascending by start date, trip-aware ranking.
 */
export const searchUpcomingEvents = async (
  params: UpcomingSearchParams,
): Promise<{ results: EventSearchResult[]; warnings?: string[] }> => {
  const todayYmd = utcTodayYmd();
  const { results, warnings } = await searchEventsWithCache(
    {
      query: params.query,
      mode: "upcoming",
      city: params.context?.tripCity,
      country: params.context?.tripCountry?.length === 2 ? params.context.tripCountry : undefined,
      startDate: params.context?.tripStartDate,
      endDate: params.context?.tripEndDate,
      limit: params.limit ?? 12,
      signal: params.signal,
    },
    { skipLegacySort: true },
  );

  const mapped = results
    .map(lookupResultToSearchResult)
    .filter((e) => e.startDate && toDateOnly(e.startDate) >= todayYmd);

  const countryCode =
    params.context?.tripCountry?.trim().length === 2 ? params.context.tripCountry.trim().toUpperCase() : undefined;

  const [tmHits, skHits] = await Promise.all([
    searchTicketmasterEvents({
      query: params.query,
      city: params.context?.tripCity,
      countryCode,
      startDate: params.context?.tripStartDate,
      endDate: params.context?.tripEndDate,
      limit: params.limit ?? 12,
      signal: params.signal,
    }).catch(() => [] as TicketmasterEventHit[]),
    searchSongkickEvents({
      query: params.query,
      city: params.context?.tripCity,
      country: params.context?.tripCountry,
      startDate: params.context?.tripStartDate,
      endDate: params.context?.tripEndDate,
      limit: params.limit ?? 12,
      signal: params.signal,
    }).catch(() => []),
  ]);

  const fromTicketmaster = tmHits.map(ticketmasterHitToSearchResult);
  const combined = [...mapped, ...fromTicketmaster, ...skHits];
  const withinTrip = filterEventsToTripContext(combined, params.context);
  const deduped = dedupeEventSearchResults(withinTrip);
  const ctx: EventRankingContext = {
    query: params.query,
    mode: "upcoming",
    tripCity: params.context?.tripCity,
    tripCountry: params.context?.tripCountry,
    tripStartDate: params.context?.tripStartDate,
    tripEndDate: params.context?.tripEndDate,
  };
  const sorted = sortUpcomingSearchResults(deduped, ctx);

  const top = sorted[0];
  if (top && Number.isFinite(top.confidenceScore) && top.confidenceScore < 0.45) {
    logAnalyticsEvent(ANALYTICS_EVENTS.event_match_low_confidence, {
      mode: "upcoming",
      resultCount: sorted.length,
      topConfidence: top.confidenceScore,
      secondConfidence: sorted[1]?.confidenceScore,
    });
  }

  return { results: sorted, warnings };
};
