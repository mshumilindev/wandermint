import type { EventLookupResult } from "../../entities/events/eventLookup.model";

const memory = new Map<string, { expiresAt: number; results: EventLookupResult[]; warnings?: string[] }>();

const LS_PREFIX = "wm_event_lookup_v1_";

export interface CachedSearchPayload {
  results: EventLookupResult[];
  warnings?: string[];
}

export const eventLookupCacheKey = (parts: Record<string, string | number | undefined>): string =>
  JSON.stringify(parts, Object.keys(parts).sort());

export const readEventLookupMemoryCache = (key: string): CachedSearchPayload | null => {
  const row = memory.get(key);
  if (!row || row.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return { results: row.results, warnings: row.warnings };
};

export const writeEventLookupMemoryCache = (key: string, payload: CachedSearchPayload, ttlMs: number): void => {
  memory.set(key, { expiresAt: Date.now() + ttlMs, results: payload.results, warnings: payload.warnings });
};

export const readEventLookupLocalStorage = (key: string): CachedSearchPayload | null => {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { expiresAt: number; results: EventLookupResult[]; warnings?: string[] };
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(`${LS_PREFIX}${key}`);
      return null;
    }
    return { results: parsed.results, warnings: parsed.warnings };
  } catch {
    return null;
  }
};

export const writeEventLookupLocalStorage = (key: string, payload: CachedSearchPayload, ttlMs: number): void => {
  try {
    const row = { expiresAt: Date.now() + ttlMs, ...payload };
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(row));
  } catch {
    /* quota */
  }
};
