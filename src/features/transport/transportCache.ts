import type { TransportTimeRequest, TransportTimeResult } from "./transport.types";

const MAX_ENTRIES = 500;

const cache = new Map<string, TransportTimeResult>();

const roundCoord = (value: number): string => value.toFixed(5);

/**
 * Stable cache key for a transport lookup (rounded coordinates avoid churn from tiny float noise).
 */
export const transportTimeCacheKey = (request: TransportTimeRequest): string =>
  [
    roundCoord(request.from.lat),
    roundCoord(request.from.lng),
    roundCoord(request.to.lat),
    roundCoord(request.to.lng),
    request.mode,
    request.departureTime ?? "",
  ].join("|");

export const getTransportTimeCached = (key: string): TransportTimeResult | undefined => {
  const hit = cache.get(key);
  if (!hit) {
    return undefined;
  }
  cache.delete(key);
  cache.set(key, hit);
  return { ...hit };
};

export const setTransportTimeCached = (key: string, value: TransportTimeResult): void => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
};

/** Test hook: clear cached routes. */
export const clearTransportTimeCacheForTests = (): void => {
  cache.clear();
};
