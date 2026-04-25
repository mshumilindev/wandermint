import type { ResolvedEntity, ResolvedEntityType } from "./entity.types";

/** Suffix/stop tokens removed only for matching — display names stay untouched on the entity. */
const MATCHING_STOP_TOKENS =
  /\b(museum|official|venue|gallery|theater|theatre|centre|center|inc|llc|ltd|co\.?|corp\.?)\b/giu;

const PUNCTUATION = /[^\p{L}\p{N}\s-]/gu;

const hashString = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
};

const toDateYmd = (raw: string): string => {
  const trimmed = raw.trim();
  const iso = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) {
    return new Date(t).toISOString().slice(0, 10);
  }
  return trimmed.toLowerCase().replace(/\s+/g, "");
};

const roundCoord = (n: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

const uniqueStrings = (items: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (t.length === 0 || seen.has(t)) {
      continue;
    }
    seen.add(t);
    out.push(t);
  }
  return out;
};

/**
 * Normalize a label for fuzzy equality (lowercase, trim, punctuation stripped,
 * common institutional suffixes removed).
 */
export const normalizeEntityNameForMatching = (raw: string): string => {
  let s = raw.normalize("NFKC").trim().toLowerCase();
  s = s.replace(PUNCTUATION, " ");
  s = s.replace(MATCHING_STOP_TOKENS, " ");
  s = s.replace(/\s+/gu, " ").trim();
  return s;
};

const tokenSet = (normalized: string): Set<string> => {
  const parts = normalized.split(/\s+/u).filter((p) => p.length > 0);
  return new Set(parts);
};

/** Jaccard similarity on word tokens of normalized strings, in `[0, 1]`. */
export const tokenSimilarity = (a: string, b: string): number => {
  const A = tokenSet(normalizeEntityNameForMatching(a));
  const B = tokenSet(normalizeEntityNameForMatching(b));
  if (A.size === 0 && B.size === 0) {
    return 1;
  }
  if (A.size === 0 || B.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const t of A) {
    if (B.has(t)) {
      inter += 1;
    }
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};

/** Great-circle distance in meters (WGS84). */
export const haversineDistanceMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6371000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
};

const buildCanonicalId = (type: ResolvedEntityType, fingerprint: string): string => {
  const h = hashString(`${type}|${fingerprint}`).toString(16);
  return `${type}:${h}`;
};

export type ResolvePlaceLikeInput = {
  name: string;
  aliases?: string[];
  latitude?: number;
  longitude?: number;
  source: string;
  confidenceScore?: number;
  type?: "place" | "venue";
};

export const resolvePlaceLikeEntity = (input: ResolvePlaceLikeInput): ResolvedEntity => {
  const type = input.type ?? "place";
  const displayName = input.name.trim();
  const norm = normalizeEntityNameForMatching(displayName);
  const latOk = typeof input.latitude === "number" && Number.isFinite(input.latitude);
  const lngOk = typeof input.longitude === "number" && Number.isFinite(input.longitude);
  const coords =
    latOk && lngOk
      ? {
          lat: input.latitude as number,
          lng: input.longitude as number,
        }
      : undefined;

  const geoPart =
    coords != null ? `${roundCoord(coords.lat, 4)}:${roundCoord(coords.lng, 4)}` : "nocoord";
  const canonicalId = buildCanonicalId(type, `${norm}|${geoPart}`);

  const aliases = uniqueStrings([...(input.aliases ?? []), displayName]).filter((a) => a !== displayName);

  return {
    canonicalId,
    canonicalName: displayName,
    aliases,
    type,
    coordinates: coords,
    confidenceScore: input.confidenceScore ?? 0.55,
    sources: [input.source],
  };
};

export type ResolveCityInput = {
  name: string;
  country?: string;
  aliases?: string[];
  source: string;
  confidenceScore?: number;
};

export const resolveCityEntity = (input: ResolveCityInput): ResolvedEntity => {
  const displayName = input.name.trim();
  const norm = normalizeEntityNameForMatching(displayName);
  const country = (input.country ?? "").trim().toLowerCase();
  const canonicalId = buildCanonicalId("city", `${norm}|${country}`);
  const aliases = uniqueStrings([...(input.aliases ?? []), displayName]).filter((a) => a !== displayName);

  return {
    canonicalId,
    canonicalName: displayName,
    aliases,
    type: "city",
    confidenceScore: input.confidenceScore ?? 0.5,
    sources: [input.source],
  };
};

export type ResolveEventInput = {
  title: string;
  venueName: string;
  dateYmd: string;
  aliases?: string[];
  latitude?: number;
  longitude?: number;
  source: string;
  confidenceScore?: number;
};

export const resolvePlaceEntity = (input: Omit<ResolvePlaceLikeInput, "type">): ResolvedEntity =>
  resolvePlaceLikeEntity({ ...input, type: "place" });

export const resolveVenueEntity = (input: Omit<ResolvePlaceLikeInput, "type">): ResolvedEntity =>
  resolvePlaceLikeEntity({ ...input, type: "venue" });

export const resolveEventEntity = (input: ResolveEventInput): ResolvedEntity => {
  const title = input.title.trim();
  const venue = input.venueName.trim();
  const dateYmd = toDateYmd(input.dateYmd);
  const titleNorm = normalizeEntityNameForMatching(title);
  const venueNorm = normalizeEntityNameForMatching(venue);
  const canonicalId = buildCanonicalId("event", `${dateYmd}|${venueNorm}|${titleNorm}`);

  const latOk = typeof input.latitude === "number" && Number.isFinite(input.latitude);
  const lngOk = typeof input.longitude === "number" && Number.isFinite(input.longitude);
  const coords =
    latOk && lngOk
      ? {
          lat: input.latitude as number,
          lng: input.longitude as number,
        }
      : undefined;

  const aliasPool = uniqueStrings([...(input.aliases ?? []), venue, title]).filter((a) => a !== title);

  return {
    canonicalId,
    canonicalName: title,
    aliases: aliasPool,
    type: "event",
    coordinates: coords,
    confidenceScore: input.confidenceScore ?? 0.5,
    sources: [input.source],
    eventKey: {
      dateYmd,
      venueNormalized: venueNorm,
      titleNormalized: titleNorm,
    },
  };
};
