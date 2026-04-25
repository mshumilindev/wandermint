import type { AnalyticsEventMeta, AnalyticsEventName } from "./analyticsEvents";

export type { AnalyticsEventMeta, AnalyticsEventName } from "./analyticsEvents";
export { ANALYTICS_EVENTS } from "./analyticsEvents";

type AnalyticsSink = (payload: { name: AnalyticsEventName; at: string; meta: Record<string, unknown> }) => void | Promise<void>;

const sinks: AnalyticsSink[] = [];

/** Optional: return true only when the user has opted into precise device location telemetry. */
let locationConsentReader: () => boolean = () => false;

export const registerAnalyticsSink = (sink: AnalyticsSink): (() => void) => {
  sinks.push(sink);
  return () => {
    const index = sinks.indexOf(sink);
    if (index >= 0) {
      sinks.splice(index, 1);
    }
  };
};

export const setAnalyticsLocationConsentProvider = (reader: () => boolean): void => {
  locationConsentReader = reader;
};

const FORBIDDEN_VALUE_KEYS = new Set(
  [
    "title",
    "message",
    "query",
    "prompt",
    "userrequest",
    "description",
    "label",
    "name",
    "address",
    "email",
    "phone",
    "rationale",
    "text",
    "content",
    "hint",
    "notes",
    "mustseenotes",
    "city",
    "venue",
    "venuename",
    "body",
    "raw",
    "summary",
    "userinput",
    "freetext",
  ].map((k) => k.toLowerCase()),
);

const COORDINATE_KEYS = new Set([
  "latitude",
  "longitude",
  "lat",
  "lng",
  "lon",
  "accuracy",
  "horizontalaccuracy",
  "altitude",
  "alt",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const shouldStripCoordinateKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  if (COORDINATE_KEYS.has(lower)) {
    return true;
  }
  return lower === "coordinates" || lower === "geo" || lower === "location" || lower.endsWith("coordinate");
};

/**
 * Redacts coordinates (unless consent), obvious free-text fields, and oversized strings.
 * Exported for unit tests only.
 */
export const sanitizeAnalyticsMeta = (meta: Record<string, unknown>, allowPreciseLocation: boolean, depth = 0): Record<string, unknown> => {
  if (depth > 6) {
    return {};
  }

  const next: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(meta)) {
    const keyLower = rawKey.toLowerCase();
    if (!allowPreciseLocation && shouldStripCoordinateKey(rawKey)) {
      continue;
    }
    if (FORBIDDEN_VALUE_KEYS.has(keyLower)) {
      continue;
    }

    if (rawValue === null || typeof rawValue === "boolean" || typeof rawValue === "number") {
      next[rawKey] = rawValue;
      continue;
    }

    if (typeof rawValue === "string") {
      if (rawValue.length > 200) {
        next[`${rawKey}Len`] = rawValue.length;
      } else {
        next[rawKey] = rawValue;
      }
      continue;
    }

    if (Array.isArray(rawValue)) {
      if (rawValue.every((item) => typeof item === "number" || typeof item === "boolean")) {
        next[rawKey] = rawValue;
        continue;
      }
      if (rawValue.every((item) => typeof item === "string")) {
        next[rawKey] = rawValue.map((item) => (item.length > 120 ? `[len:${item.length}]` : item));
        continue;
      }
      const nested = rawValue
        .map((item) => (isPlainObject(item) ? sanitizeAnalyticsMeta(item, allowPreciseLocation, depth + 1) : null))
        .filter((item): item is Record<string, unknown> => item !== null);
      if (nested.length > 0) {
        next[rawKey] = nested;
      }
      continue;
    }

    if (isPlainObject(rawValue)) {
      next[rawKey] = sanitizeAnalyticsMeta(rawValue, allowPreciseLocation, depth + 1);
    }
  }

  return next;
};

const runSink = async (sink: AnalyticsSink, payload: { name: AnalyticsEventName; at: string; meta: Record<string, unknown> }): Promise<void> => {
  try {
    await sink(payload);
  } catch {
    /* analytics must never break the app */
  }
};

export const logAnalyticsEvent = <K extends AnalyticsEventName>(name: K, meta: AnalyticsEventMeta[K]): void => {
  try {
    const at = new Date().toISOString();
    const allowPreciseLocation = locationConsentReader();
    let safeMeta: Record<string, unknown>;
    try {
      safeMeta = sanitizeAnalyticsMeta(meta as unknown as Record<string, unknown>, allowPreciseLocation);
    } catch {
      safeMeta = { sanitizeFailed: true };
    }

    const payload = { name, at, meta: safeMeta };

    for (const sink of sinks) {
      void runSink(sink, payload);
    }
  } catch {
    /* observability must never break the app */
  }
};
