import { userCorrectionsToPlaceContributions } from "../../corrections/correctionRepository";
import type { OpeningHours } from "../opening-hours/openingHours.types";
import type {
  EnrichedAddress,
  EnrichedCoordinates,
  EnrichedFactualFieldKey,
  EnrichedFieldKey,
  EnrichedOpeningHours,
  EnrichedPlace,
  EnrichedPriceRange,
  EnrichPlaceParams,
  EnrichmentSourceKind,
  FieldConfidence,
  FieldProvenanceMap,
  FieldReliabilityMap,
  PlaceEnrichmentContribution,
  PlaceEnrichmentPartial,
} from "./placeEnrichment.types";

const MAX_CACHE_ENTRIES = 2000;

const cache = new Map<string, EnrichedPlace>();

const CONFIDENCE_RANK: Record<FieldConfidence, number> = {
  user_override: 10,
  authoritative: 5,
  high: 4,
  medium: 3,
  low: 2,
  unverified: 1,
};

type Held<T> = {
  value: T;
  rank: number;
  confidence: FieldConfidence;
  sourceKind: EnrichmentSourceKind;
};

const rankOf = (c: FieldConfidence): number => CONFIDENCE_RANK[c];

const fieldConfidence = (
  contribution: PlaceEnrichmentContribution,
  field: EnrichedFieldKey,
): FieldConfidence =>
  contribution.fieldReliabilityOverrides?.[field] ?? contribution.defaultFactualReliability;

const pickHeld = <T,>(current: Held<T> | undefined, next: Held<T> | undefined): Held<T> | undefined => {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  if (next.rank > current.rank) {
    return next;
  }
  if (next.rank < current.rank) {
    return current;
  }
  return current;
};

const aiAssistantDescriptionOnly = (contribution: PlaceEnrichmentContribution): PlaceEnrichmentContribution => {
  if (contribution.sourceKind !== "ai_assistant") {
    return contribution;
  }
  return {
    ...contribution,
    partial: contribution.partial.description !== undefined ? { description: contribution.partial.description } : {},
  };
};

const held = <T,>(
  value: T | undefined,
  contribution: PlaceEnrichmentContribution,
  field: EnrichedFieldKey,
): Held<T> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const confidence = fieldConfidence(contribution, field);
  return {
    value,
    rank: rankOf(confidence),
    confidence,
    sourceKind: contribution.sourceKind,
  };
};

type OpeningHoursCandidate = { variant: "structured"; value: OpeningHours } | { variant: "label"; label: string; timezone?: string };

const mergeOpeningHoursCandidates = (
  structured: Held<OpeningHours> | undefined,
  label: Held<{ label: string; timezone?: string }> | undefined,
): Held<OpeningHoursCandidate> | undefined => {
  const structCand = structured ? { variant: "structured" as const, value: structured.value, held: structured } : undefined;
  const labelCand = label
    ? { variant: "label" as const, value: { label: label.value.label, timezone: label.value.timezone }, held: label }
    : undefined;
  if (!structCand && !labelCand) {
    return undefined;
  }
  if (!structCand) {
    const h = labelCand!.held;
    return {
      value: { variant: "label", label: h.value.label, timezone: h.value.timezone },
      rank: h.rank,
      confidence: h.confidence,
      sourceKind: h.sourceKind,
    };
  }
  if (!labelCand) {
    const h = structCand.held;
    return {
      value: { variant: "structured", value: h.value },
      rank: h.rank,
      confidence: h.confidence,
      sourceKind: h.sourceKind,
    };
  }
  if (structCand.held.rank > labelCand.held.rank) {
    const h = structCand.held;
    return { value: { variant: "structured", value: h.value }, rank: h.rank, confidence: h.confidence, sourceKind: h.sourceKind };
  }
  if (labelCand.held.rank > structCand.held.rank) {
    const h = labelCand.held;
    return {
      value: { variant: "label", label: h.value.label, timezone: h.value.timezone },
      rank: h.rank,
      confidence: h.confidence,
      sourceKind: h.sourceKind,
    };
  }
  const h = structCand.held;
  return { value: { variant: "structured", value: h.value }, rank: h.rank, confidence: h.confidence, sourceKind: h.sourceKind };
};

const readCache = (key: string): EnrichedPlace | undefined => {
  const hit = cache.get(key);
  if (!hit) {
    return undefined;
  }
  cache.delete(key);
  cache.set(key, hit);
  return { ...hit };
};

const writeCache = (key: string, value: EnrichedPlace): void => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
};

const buildReliabilityAndProvenance = (args: {
  canonicalName: Held<string>;
  coordinates?: Held<EnrichedCoordinates>;
  address?: Held<EnrichedAddress>;
  category?: Held<string>;
  openingHours?: Held<OpeningHoursCandidate>;
  priceLevel?: Held<number>;
  priceRange?: Held<EnrichedPriceRange>;
  image?: Held<string>;
  rating?: Held<number>;
  popularity?: Held<number>;
  officialUrl?: Held<string>;
  bookingUrl?: Held<string>;
  description?: Held<string>;
}): { fieldReliability: FieldReliabilityMap; fieldProvenance?: FieldProvenanceMap } => {
  const fieldReliability: FieldReliabilityMap = {
    canonicalName: args.canonicalName.confidence,
  };
  const fieldProvenance: FieldProvenanceMap = {
    canonicalName: args.canonicalName.sourceKind,
  };
  const assign = (key: EnrichedFieldKey, h: Held<unknown> | undefined): void => {
    if (!h) {
      return;
    }
    fieldReliability[key] = h.confidence;
    fieldProvenance[key] = h.sourceKind;
  };
  assign("coordinates", args.coordinates);
  assign("address", args.address);
  assign("category", args.category);
  assign("openingHours", args.openingHours);
  assign("priceLevel", args.priceLevel);
  assign("priceRange", args.priceRange);
  assign("image", args.image);
  assign("rating", args.rating);
  assign("popularity", args.popularity);
  assign("officialUrl", args.officialUrl);
  assign("bookingUrl", args.bookingUrl);
  assign("description", args.description);
  return { fieldReliability, fieldProvenance };
};

const mergeContributions = (contributions: readonly PlaceEnrichmentContribution[], enrichedPlaceId: string): EnrichedPlace => {
  if (contributions.length === 0) {
    throw new TypeError("enrichPlace requires at least one contribution.");
  }

  let canonical: Held<string> | undefined;
  let coordinates: Held<EnrichedCoordinates> | undefined;
  let address: Held<EnrichedAddress> | undefined;
  let category: Held<string> | undefined;
  let openingStructured: Held<OpeningHours> | undefined;
  let openingLabel: Held<{ label: string; timezone?: string }> | undefined;
  let priceLevel: Held<number> | undefined;
  let priceRange: Held<EnrichedPriceRange> | undefined;
  let image: Held<string> | undefined;
  let rating: Held<number> | undefined;
  let popularity: Held<number> | undefined;
  let officialUrl: Held<string> | undefined;
  let bookingUrl: Held<string> | undefined;
  let description: Held<string> | undefined;

  for (const raw of contributions) {
    const contribution = aiAssistantDescriptionOnly(raw);
    const p: PlaceEnrichmentPartial = contribution.partial;

    canonical = pickHeld(canonical, held(p.canonicalName, contribution, "canonicalName"));
    coordinates = pickHeld(coordinates, held(p.coordinates, contribution, "coordinates"));
    address = pickHeld(address, held(p.address, contribution, "address"));
    category = pickHeld(category, held(p.category, contribution, "category"));
    openingStructured = pickHeld(openingStructured, held(p.openingHoursStructured, contribution, "openingHours"));
    if (p.openingHoursLabel !== undefined && p.openingHoursLabel.trim() !== "") {
      openingLabel = pickHeld(
        openingLabel,
        held({ label: p.openingHoursLabel.trim(), timezone: p.openingHoursTimezone }, contribution, "openingHours"),
      );
    }
    priceLevel = pickHeld(priceLevel, held(p.priceLevel, contribution, "priceLevel"));
    priceRange = pickHeld(priceRange, held(p.priceRange, contribution, "priceRange"));
    image = pickHeld(image, held(p.imageUrl, contribution, "image"));
    rating = pickHeld(rating, held(p.rating, contribution, "rating"));
    popularity = pickHeld(popularity, held(p.popularity, contribution, "popularity"));
    officialUrl = pickHeld(officialUrl, held(p.officialUrl, contribution, "officialUrl"));
    bookingUrl = pickHeld(bookingUrl, held(p.bookingUrl, contribution, "bookingUrl"));
    description = pickHeld(description, held(p.description, contribution, "description"));
  }

  if (!canonical) {
    throw new TypeError("enrichPlace requires at least one contribution with canonicalName (non-AI or post-sanitization).");
  }

  const openingHours = mergeOpeningHoursCandidates(openingStructured, openingLabel);
  const { fieldReliability, fieldProvenance } = buildReliabilityAndProvenance({
    canonicalName: canonical,
    coordinates,
    address,
    category,
    openingHours,
    priceLevel,
    priceRange,
    image,
    rating,
    popularity,
    officialUrl,
    bookingUrl,
    description,
  });

  const out: EnrichedPlace = {
    id: enrichedPlaceId,
    canonicalName: canonical.value,
    coordinates: coordinates?.value,
    address: address?.value,
    category: category?.value,
    openingHours: openingHours?.value,
    priceLevel: priceLevel?.value,
    priceRange: priceRange?.value,
    imageUrl: image?.value,
    rating: rating?.value,
    popularity: popularity?.value,
    officialUrl: officialUrl?.value,
    bookingUrl: bookingUrl?.value,
    description: description?.value,
    fieldReliability,
    fieldProvenance,
    enrichedAt: new Date().toISOString(),
  };
  return out;
};

/**
 * Merges multi-source place shards by **field-level reliability** (higher confidence wins;
 * equal confidence keeps the first seen value). `ai_assistant` rows only contribute
 * {@link PlaceEnrichmentPartial.description}; factual keys are ignored so models cannot
 * invent coordinates, hours, or URLs.
 *
 * Pass {@link EnrichPlaceParams.userCorrections} (e.g. from `correctionRepository.listForEntity`)
 * so manual fixes apply with `user_override` and beat every provider/AI shard.
 * Results are memoized by `cacheKey` unless `forceRefresh` is set.
 */
export const enrichPlace = (params: EnrichPlaceParams): EnrichedPlace => {
  const key = params.cacheKey.trim();
  if (key.length === 0) {
    throw new TypeError("cacheKey must be non-empty.");
  }
  if (!params.forceRefresh) {
    const cached = readCache(key);
    if (cached) {
      return cached;
    }
  }
  const id = params.enrichedPlaceId?.trim() || key;
  const correctionContributions = userCorrectionsToPlaceContributions(params.userCorrections ?? []);
  const merged = mergeContributions([...params.contributions, ...correctionContributions], id);
  writeCache(key, merged);
  return merged;
};

/** Drops a memoized merge so the next {@link enrichPlace} run recomputes (e.g. after {@link applyUserCorrection}). */
export const invalidatePlaceEnrichmentCache = (cacheKey: string): void => {
  const k = cacheKey.trim();
  if (k.length === 0) {
    return;
  }
  cache.delete(k);
};

/** Test hook: clear enrichment memoization. */
export const clearPlaceEnrichmentCacheForTests = (): void => {
  cache.clear();
};
