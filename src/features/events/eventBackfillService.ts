import { searchEventsWithCache } from "../../services/events/eventLookupService";
import { dateRangesOverlap, dedupeEventSearchResults, sortBackfillSearchResults, type EventRankingContext } from "./eventRanking";
import { lookupResultToSearchResult } from "./eventSearchService";
import type { EventSearchResult, TripEventSearchContext } from "./eventSearch.types";
import { toDateOnly } from "./eventSearch.types";

export type BackfillSearchParams = {
  query: string;
  context?: TripEventSearchContext;
  limit?: number;
  signal?: AbortSignal;
};

const utcTodayYmd = (): string => new Date().toISOString().slice(0, 10);

/**
 * Past-only search for memories / completed trips: optional trip window filter,
 * strong trip city/country ranking, chronological order.
 */
export const searchBackfillPastEvents = async (
  params: BackfillSearchParams,
): Promise<{ results: EventSearchResult[]; warnings?: string[] }> => {
  const todayYmd = utcTodayYmd();
  const { results, warnings } = await searchEventsWithCache(
    {
      query: params.query,
      mode: "past",
      city: params.context?.tripCity,
      country: params.context?.tripCountry?.length === 2 ? params.context.tripCountry : undefined,
      startDate: params.context?.tripStartDate,
      endDate: params.context?.tripEndDate,
      limit: params.limit ?? 12,
      signal: params.signal,
    },
    { skipLegacySort: true },
  );

  let mapped: EventSearchResult[] = results.map(lookupResultToSearchResult).filter((e) => Boolean(e.startDate));

  mapped = mapped.filter((e) => toDateOnly(e.endDate ?? e.startDate) < todayYmd);

  if (params.context?.tripStartDate?.trim() && params.context?.tripEndDate?.trim()) {
    const ts = params.context.tripStartDate.trim();
    const te = params.context.tripEndDate.trim();
    mapped = mapped.filter((e) => dateRangesOverlap(e.startDate, e.endDate, ts, te));
  }

  const deduped = dedupeEventSearchResults(mapped);
  const ctx: EventRankingContext = {
    query: params.query,
    mode: "past",
    tripCity: params.context?.tripCity,
    tripCountry: params.context?.tripCountry,
    tripStartDate: params.context?.tripStartDate,
    tripEndDate: params.context?.tripEndDate,
  };
  const sorted = sortBackfillSearchResults(deduped, ctx);

  return { results: sorted, warnings };
};
