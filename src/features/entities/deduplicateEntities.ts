import type { DeduplicateEntitiesOptions, ResolvedEntity } from "./entity.types";
import { haversineDistanceMeters, normalizeEntityNameForMatching, tokenSimilarity } from "./entityResolver";

const DEFAULT_MERGE_THRESHOLD = 0.72;
const DEFAULT_LOW_CUTOFF = 0.38;
const DEFAULT_MAX_PLACE_M = 450;

const nameStrongMatch = (a: ResolvedEntity, b: ResolvedEntity): boolean => {
  const na = normalizeEntityNameForMatching(a.canonicalName);
  const nb = normalizeEntityNameForMatching(b.canonicalName);
  if (na.length > 0 && na === nb) {
    return true;
  }
  const aliasNorms = new Set([...a.aliases, ...b.aliases].map(normalizeEntityNameForMatching));
  if (aliasNorms.has(na) && aliasNorms.has(nb)) {
    return na === nb;
  }
  return tokenSimilarity(a.canonicalName, b.canonicalName) >= 0.92;
};

const placeVenueCityMergeScore = (a: ResolvedEntity, b: ResolvedEntity, maxPlaceM: number): number => {
  const nameScore = tokenSimilarity(a.canonicalName, b.canonicalName);
  const aliasBoost =
    [...a.aliases].some((al) => tokenSimilarity(al, b.canonicalName) > 0.88) ||
    [...b.aliases].some((al) => tokenSimilarity(al, a.canonicalName) > 0.88)
      ? 0.08
      : 0;

  let geoFactor = 1;
  if (a.coordinates && b.coordinates) {
    const d = haversineDistanceMeters(a.coordinates, b.coordinates);
    if (d <= maxPlaceM) {
      geoFactor = 1;
    } else if (d <= maxPlaceM * 4) {
      geoFactor = 0.55;
    } else {
      geoFactor = nameStrongMatch(a, b) ? 0.45 : 0.12;
    }
  } else if (!a.coordinates && !b.coordinates) {
    geoFactor = 0.85;
  } else {
    geoFactor = 0.72;
  }

  return Math.min(1, (nameScore + aliasBoost) * geoFactor);
};

const eventMergeScore = (a: ResolvedEntity, b: ResolvedEntity): number => {
  const ka = a.eventKey;
  const kb = b.eventKey;
  if (!ka || !kb) {
    return 0;
  }
  if (ka.dateYmd !== kb.dateYmd) {
    return 0;
  }
  const venueSim = tokenSimilarity(ka.venueNormalized, kb.venueNormalized);
  const titleSim = tokenSimilarity(ka.titleNormalized, kb.titleNormalized);
  if (venueSim >= 0.94 && titleSim >= 0.94) {
    return 1;
  }
  return 0.38 * venueSim + 0.62 * titleSim;
};

export const computeEntityMergeScore = (a: ResolvedEntity, b: ResolvedEntity, maxPlaceM: number): number => {
  if (a.type !== b.type) {
    return 0;
  }
  if (a.type === "event") {
    return eventMergeScore(a, b);
  }
  if (a.type === "place" || a.type === "venue" || a.type === "city") {
    return placeVenueCityMergeScore(a, b, maxPlaceM);
  }
  return 0;
};

const mergePair = (into: ResolvedEntity, from: ResolvedEntity): ResolvedEntity => {
  const pickName =
    from.confidenceScore > into.confidenceScore
      ? from.canonicalName
      : into.confidenceScore > from.confidenceScore
        ? into.canonicalName
        : into.canonicalName.localeCompare(from.canonicalName) <= 0
          ? into.canonicalName
          : from.canonicalName;

  const mergedAliases = uniqueStrings([
    ...into.aliases,
    ...from.aliases,
    into.canonicalName,
    from.canonicalName,
  ]).filter((x) => x !== pickName);

  const mergedSources = uniqueStrings([...into.sources, ...from.sources]);

  let coordinates = into.coordinates;
  if (into.coordinates && from.coordinates) {
    coordinates = {
      lat: (into.coordinates.lat + from.coordinates.lat) / 2,
      lng: (into.coordinates.lng + from.coordinates.lng) / 2,
    };
  } else if (!into.coordinates && from.coordinates) {
    coordinates = from.coordinates;
  }

  const confidenceScore = Math.max(into.confidenceScore, from.confidenceScore);

  return {
    canonicalId: into.canonicalId,
    canonicalName: pickName,
    aliases: mergedAliases,
    type: into.type,
    coordinates,
    confidenceScore,
    sources: mergedSources,
    eventKey: into.eventKey ?? from.eventKey,
  };
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
 * Collapse near-duplicate {@link ResolvedEntity} rows using name / geo / event-key rules.
 * Entities at or below `lowConfidenceMergeCutoff` are never merged (they remain separate).
 */
export const deduplicateEntities = (
  entities: readonly ResolvedEntity[],
  options?: DeduplicateEntitiesOptions,
): ResolvedEntity[] => {
  const mergeThreshold = options?.mergeThreshold ?? DEFAULT_MERGE_THRESHOLD;
  const lowCut = options?.lowConfidenceMergeCutoff ?? DEFAULT_LOW_CUTOFF;
  const maxPlaceM = options?.maxPlaceDistanceMeters ?? DEFAULT_MAX_PLACE_M;

  const sorted = [...entities].sort((x, y) => y.confidenceScore - x.confidenceScore);
  const out: ResolvedEntity[] = [];

  for (const candidate of sorted) {
    if (candidate.confidenceScore <= lowCut) {
      out.push(candidate);
      continue;
    }

    let mergedInto: number | null = null;
    for (let i = 0; i < out.length; i += 1) {
      const existing = out[i];
      if (!existing) {
        continue;
      }
      if (existing.confidenceScore <= lowCut) {
        continue;
      }
      if (existing.type !== candidate.type) {
        continue;
      }

      const score = computeEntityMergeScore(existing, candidate, maxPlaceM);
      if (score >= mergeThreshold) {
        out[i] = mergePair(existing, candidate);
        mergedInto = i;
        break;
      }
    }

    if (mergedInto === null) {
      out.push({ ...candidate, aliases: [...candidate.aliases] });
    }
  }

  return out;
};

/** Prefer this name in UI code: one row per real-world entity after dedup. */
export const selectCanonicalEntitiesForDisplay = deduplicateEntities;
