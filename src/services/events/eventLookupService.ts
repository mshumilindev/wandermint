import type { EventLookupResult } from "../../entities/events/eventLookup.model";
import {
  eventLookupCacheKey,
  readEventLookupLocalStorage,
  readEventLookupMemoryCache,
  writeEventLookupLocalStorage,
  writeEventLookupMemoryCache,
} from "./eventLookupCache";
import { fetchEventSearch, type EventSearchParams } from "./eventLookupClient";
import { dedupeEventResults, sortEventResults } from "./eventNormalizer";

const ttlForMode = (mode: "upcoming" | "past"): number =>
  mode === "upcoming" ? 6 * 60 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;

export type SearchEventsWithCacheOptions = {
  /** When true, skip legacy score-only sort so feature-layer ranking can run. */
  skipLegacySort?: boolean;
};

export const searchEventsWithCache = async (
  params: EventSearchParams,
  options?: SearchEventsWithCacheOptions,
): Promise<{ results: EventLookupResult[]; warnings?: string[] }> => {
  const key = eventLookupCacheKey({
    q: params.query,
    m: params.mode,
    c: params.city,
    co: params.country,
    s: params.startDate,
    e: params.endDate,
    l: params.limit,
  });
  const ttl = ttlForMode(params.mode);

  const memHit = readEventLookupMemoryCache(key);
  if (memHit) {
    return applyPostProcess(memHit, params, options);
  }
  const lsHit = readEventLookupLocalStorage(key);
  if (lsHit) {
    writeEventLookupMemoryCache(key, lsHit, ttl);
    return applyPostProcess(lsHit, params, options);
  }

  const remote = await fetchEventSearch({ ...params, signal: params.signal });
  const normalized = { results: dedupeEventResults(remote.results), warnings: remote.warnings };
  writeEventLookupMemoryCache(key, normalized, ttl);
  writeEventLookupLocalStorage(key, normalized, ttl);
  return applyPostProcess(normalized, params, options);
};

const applyPostProcess = (
  remote: { results: EventLookupResult[]; warnings?: string[] },
  params: EventSearchParams,
  options?: SearchEventsWithCacheOptions,
): { results: EventLookupResult[]; warnings?: string[] } => {
  if (options?.skipLegacySort) {
    return { results: remote.results, warnings: remote.warnings };
  }
  return {
    results: sortEventResults(remote.results, params.query, params.mode, params.city, params.country),
    warnings: remote.warnings,
  };
};
