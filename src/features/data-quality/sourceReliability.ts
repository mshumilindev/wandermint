import type {
  EntityReliabilityMap,
  FieldReliability,
  FieldReliabilityWarning,
  ReliabilityField,
  ReliabilityWarningSeverity,
  SourceName,
} from "./sourceReliability.types";

/** Hard ceiling: AI-sourced values are never treated as authoritative truth. */
export const AI_GENERATED_CONFIDENCE_CEILING = 0.35;

/** Half-life for `local_cache` decay (ms). */
export const LOCAL_CACHE_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

const OPENING_HOURS_PREFERRED: ReadonlySet<SourceName> = new Set(["google_places", "ticketmaster", "manual_user_input"]);

/** Ticketmaster-class providers, user edits, and Google listings (not live OSM/Wikimedia text). */
const EVENT_DATE_PREFERRED: ReadonlySet<SourceName> = new Set(["ticketmaster", "manual_user_input", "google_places"]);

const IMAGE_ACCEPTABLE: ReadonlySet<SourceName> = new Set([
  "manual_user_input",
  "google_places",
  "wikimedia",
  "ticketmaster",
  "openstreetmap",
  "local_cache",
]);

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const applySourceCeiling = (fr: FieldReliability): FieldReliability => {
  if (fr.source === "ai_generated") {
    return { ...fr, confidence: clamp01(Math.min(fr.confidence, AI_GENERATED_CONFIDENCE_CEILING)) };
  }
  return { ...fr, confidence: clamp01(fr.confidence) };
};

/**
 * Reduces confidence for stale `local_cache` rows (exponential decay by half-life).
 * Other sources: optional light decay only when `lastVerifiedAt` is very old (optional policy).
 */
export const applyCacheDecay = (fr: FieldReliability, nowMs: number = Date.now()): FieldReliability => {
  const capped = applySourceCeiling(fr);
  if (!capped.lastVerifiedAt) {
    return capped;
  }
  const verified = Date.parse(capped.lastVerifiedAt);
  if (!Number.isFinite(verified)) {
    return capped;
  }

  if (capped.source === "local_cache") {
    const age = Math.max(0, nowMs - verified);
    const factor = Math.pow(0.5, age / LOCAL_CACHE_HALF_LIFE_MS);
    return { ...capped, confidence: clamp01(capped.confidence * factor) };
  }

  // Slight staleness penalty for any cached-at timestamp (not as aggressive as local_cache).
  const ageDays = (nowMs - verified) / (24 * 60 * 60 * 1000);
  if (ageDays > 90) {
    return { ...capped, confidence: clamp01(capped.confidence * 0.92) };
  }
  if (ageDays > 30) {
    return { ...capped, confidence: clamp01(capped.confidence * 0.97) };
  }
  return capped;
};

/** `ai_generated` is never authoritative, regardless of numeric confidence. */
export const isAuthoritative = (fr: FieldReliability): boolean => fr.source !== "ai_generated" && fr.confidence > 0;

export const isManualSource = (source: SourceName): boolean => source === "manual_user_input";

/** Base affinity score in [0,1] for how suitable a source is for a given field (before per-value confidence). */
export const sourceFieldAffinity = (source: SourceName, field: ReliabilityField): number => {
  if (source === "manual_user_input") {
    return 1;
  }
  if (source === "ai_generated") {
    return 0.15;
  }

  switch (field) {
    case "openingHours":
      if (OPENING_HOURS_PREFERRED.has(source)) {
        return source === "google_places" ? 0.95 : source === "ticketmaster" ? 0.88 : 1;
      }
      if (source === "openstreetmap") {
        return 0.35;
      }
      if (source === "wikimedia") {
        return 0.12;
      }
      if (source === "local_cache") {
        return 0.55;
      }
      return 0.25;
    case "eventDate":
      if (EVENT_DATE_PREFERRED.has(source)) {
        if (source === "ticketmaster") {
          return 0.96;
        }
        if (source === "google_places") {
          return 0.78;
        }
        return 1;
      }
      if (source === "wikimedia") {
        return 0.2;
      }
      if (source === "local_cache") {
        return 0.5;
      }
      return 0.28;
    case "image":
      if (IMAGE_ACCEPTABLE.has(source)) {
        return source === "wikimedia" ? 0.72 : source === "google_places" ? 0.85 : 0.78;
      }
      return 0.2;
    case "location":
      if (source === "google_places") {
        return 0.92;
      }
      if (source === "openstreetmap") {
        return 0.88;
      }
      if (source === "ticketmaster") {
        return 0.75;
      }
      if (source === "wikimedia") {
        return 0.55;
      }
      if (source === "local_cache") {
        return 0.62;
      }
      return 0.3;
    case "price":
      if (source === "google_places" || source === "ticketmaster") {
        return 0.82;
      }
      if (source === "openstreetmap" || source === "wikimedia") {
        return 0.35;
      }
      if (source === "local_cache") {
        return 0.58;
      }
      return 0.25;
    case "title":
    default:
      if (source === "google_places" || source === "ticketmaster") {
        return 0.85;
      }
      if (source === "wikimedia") {
        return 0.65;
      }
      if (source === "openstreetmap") {
        return 0.55;
      }
      if (source === "local_cache") {
        return 0.6;
      }
      return 0.28;
  }
};

/** Effective score for picking the best candidate for a field. */
export const effectiveFieldScore = (fr: FieldReliability, field: ReliabilityField, nowMs?: number): number => {
  const decayed = applyCacheDecay(fr, nowMs ?? Date.now());
  return clamp01(decayed.confidence * sourceFieldAffinity(decayed.source, field));
};

/**
 * Returns positive if `a` should win over `b` for this field.
 * Rule: manual_user_input always wins when scores tie or are close (within epsilon).
 */
export const compareFieldCandidates = (a: FieldReliability, b: FieldReliability, field: ReliabilityField, nowMs?: number): number => {
  const sa = effectiveFieldScore(a, field, nowMs);
  const sb = effectiveFieldScore(b, field, nowMs);
  const diff = sa - sb;
  const eps = 1e-4;
  if (Math.abs(diff) < eps) {
    if (isManualSource(a.source) && !isManualSource(b.source)) {
      return 1;
    }
    if (!isManualSource(a.source) && isManualSource(b.source)) {
      return -1;
    }
  }
  return diff;
};

export const pickBestFieldReliability = (
  candidates: FieldReliability[],
  field: ReliabilityField,
  nowMs?: number,
): FieldReliability | null => {
  const list = candidates.filter(Boolean);
  if (list.length === 0) {
    return null;
  }
  let best = applyCacheDecay(list[0]!, nowMs ?? Date.now());
  for (let i = 1; i < list.length; i += 1) {
    const next = applyCacheDecay(list[i]!, nowMs ?? Date.now());
    if (compareFieldCandidates(next, best, field, nowMs) > 0) {
      best = next;
    }
  }
  return best;
};

/** Merge several partial maps by picking the best reliability per field. */
export const mergeEntityReliabilityMaps = (maps: EntityReliabilityMap[], nowMs?: number): EntityReliabilityMap => {
  const fields: ReliabilityField[] = ["title", "location", "openingHours", "price", "image", "eventDate"];
  const out: EntityReliabilityMap = {};
  for (const field of fields) {
    const candidates = maps.map((m) => m[field]).filter((fr): fr is FieldReliability => Boolean(fr));
    const best = pickBestFieldReliability(candidates, field, nowMs);
    if (best) {
      out[field] = best;
    }
  }
  return out;
};

const severityFor = (confidence: number, field: ReliabilityField): ReliabilityWarningSeverity => {
  const critical = DEFAULT_CRITICAL_THRESHOLDS[field];
  if (confidence < critical - 0.2) {
    return "high";
  }
  if (confidence < critical) {
    return "medium";
  }
  return "low";
};

/** Minimum confidence before we surface a UI warning for a field that is considered critical. */
export const DEFAULT_CRITICAL_THRESHOLDS: Record<ReliabilityField, number> = {
  title: 0.72,
  location: 0.78,
  openingHours: 0.8,
  price: 0.65,
  image: 0.45,
  eventDate: 0.82,
};

const WARNING_KEYS: Record<ReliabilityField, string> = {
  title: "dataQuality.warning.titleLowConfidence",
  location: "dataQuality.warning.locationLowConfidence",
  openingHours: "dataQuality.warning.openingHoursLowConfidence",
  price: "dataQuality.warning.priceLowConfidence",
  image: "dataQuality.warning.imageLowConfidence",
  eventDate: "dataQuality.warning.eventDateLowConfidence",
};

/**
 * Surfaces fields that are both "critical" for the caller and below the confidence threshold,
 * or that use a non-authoritative / weak source for critical data (e.g. AI for opening hours).
 */
export const getLowConfidenceWarnings = (
  map: EntityReliabilityMap,
  criticalFields: ReliabilityField[],
  options?: { nowMs?: number; thresholds?: Partial<Record<ReliabilityField, number>> },
): FieldReliabilityWarning[] => {
  const nowMs = options?.nowMs ?? Date.now();
  const thresholds = { ...DEFAULT_CRITICAL_THRESHOLDS, ...options?.thresholds };
  const warnings: FieldReliabilityWarning[] = [];

  for (const field of criticalFields) {
    const raw = map[field];
    if (!raw) {
      continue;
    }
    const fr = applyCacheDecay(raw, nowMs);
    const threshold = thresholds[field] ?? 0.7;
    const weakForField =
      fr.confidence < threshold ||
      fr.source === "ai_generated" ||
      (field === "openingHours" && !OPENING_HOURS_PREFERRED.has(fr.source)) ||
      (field === "eventDate" && !EVENT_DATE_PREFERRED.has(fr.source));

    if (!weakForField) {
      continue;
    }

    warnings.push({
      field,
      severity: severityFor(fr.confidence, field),
      messageKey: WARNING_KEYS[field],
      source: fr.source,
      confidence: fr.confidence,
    });
  }

  return warnings;
};

/** Map legacy place/event provider strings into `SourceName` where possible. */
export const providerStringToSourceName = (provider: string | undefined | null): SourceName | null => {
  if (!provider) {
    return null;
  }
  const p = provider.toLowerCase().trim();
  if (p === "ticketmaster" || p === "bandsintown" || p === "songkick") {
    return "ticketmaster";
  }
  if (p.includes("google") || p === "google_places") {
    return "google_places";
  }
  if (p.includes("wikimedia") || p.includes("wikipedia") || p.includes("wikidata")) {
    return "wikimedia";
  }
  if (p === "manual") {
    return "manual_user_input";
  }
  if (p === "openstreetmap" || p === "osm") {
    return "openstreetmap";
  }
  return null;
};
