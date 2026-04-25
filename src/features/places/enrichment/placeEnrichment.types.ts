import type { UserCorrection } from "../../corrections/correction.types";
import type { OpeningHours } from "../opening-hours/openingHours.types";

/** Identifies where a shard of place data came from (drives default factual trust). */
export type EnrichmentSourceKind =
  | "maps_provider"
  | "booking_provider"
  | "osm"
  | "wikidata"
  | "user_verified"
  | "user_correction"
  | "official_registry"
  | "heuristic"
  | "ai_assistant"
  | "unknown";

/**
 * Ordinal trust for **factual** fields. Higher wins; equal keeps the incumbent (stable merge).
 * AI assistants must not raise factual trust above {@link AI_DESCRIPTION_ONLY_RANK}.
 */
export type FieldConfidence = "user_override" | "authoritative" | "high" | "medium" | "low" | "unverified";

/** Factual keys that may appear on {@link EnrichedPlace} (excludes description). */
export type EnrichedFactualFieldKey =
  | "canonicalName"
  | "coordinates"
  | "address"
  | "category"
  | "openingHours"
  | "priceRange"
  | "priceLevel"
  | "image"
  | "rating"
  | "popularity"
  | "officialUrl"
  | "bookingUrl";

export type EnrichedDescriptionFieldKey = "description";

export type EnrichedFieldKey = EnrichedFactualFieldKey | EnrichedDescriptionFieldKey;

/** Per-field confidence of the value currently stored on {@link EnrichedPlace}. */
export type FieldReliabilityMap = Partial<Record<EnrichedFieldKey, FieldConfidence>>;

/** Provenance of which source kind supplied the winning value (optional debug / audit). */
export type FieldProvenanceMap = Partial<Record<EnrichedFieldKey, EnrichmentSourceKind>>;

export type EnrichedCoordinates = {
  lat: number;
  lng: number;
};

export type EnrichedAddress = {
  /** Single-line display address when components are unknown. */
  formatted?: string;
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

export type EnrichedPriceRange = {
  min: number;
  max: number;
  currency: string;
};

/**
 * Opening hours: prefer structured model when merged; label-only is a fallback
 * when no structured hours beat it on reliability.
 */
export type EnrichedOpeningHours =
  | { variant: "structured"; value: OpeningHours }
  | { variant: "label"; label: string; timezone?: string };

export type EnrichedPlace = {
  /** Stable id for this enrichment record (often provider place id or dedupe key). */
  id: string;
  canonicalName: string;
  coordinates?: EnrichedCoordinates;
  address?: EnrichedAddress;
  category?: string;
  openingHours?: EnrichedOpeningHours;
  /** Numeric vendor level (e.g. 0–4) when no currency range exists. */
  priceLevel?: number;
  priceRange?: EnrichedPriceRange;
  imageUrl?: string;
  rating?: number;
  /** Optional secondary signal (e.g. review volume index, trending score). */
  popularity?: number;
  officialUrl?: string;
  bookingUrl?: string;
  /** Narrative only; never sourced from AI for factual keys. */
  description?: string;
  fieldReliability: FieldReliabilityMap;
  fieldProvenance?: FieldProvenanceMap;
  enrichedAt: string;
};

/**
 * One provider / model / user edit worth of fields. Factual reliability defaults to
 * `defaultFactualReliability` unless a field override is set.
 *
 * For `sourceKind === "ai_assistant"`, only `description` is read — factual keys are ignored
 * so the model cannot invent coordinates, hours, URLs, etc.
 */
export type PlaceEnrichmentContribution = {
  contributionId: string;
  sourceKind: EnrichmentSourceKind;
  defaultFactualReliability: FieldConfidence;
  fieldReliabilityOverrides?: Partial<Record<EnrichedFactualFieldKey | EnrichedDescriptionFieldKey, FieldConfidence>>;
  partial: PlaceEnrichmentPartial;
};

export type PlaceEnrichmentPartial = {
  canonicalName?: string;
  coordinates?: EnrichedCoordinates;
  address?: EnrichedAddress;
  category?: string;
  openingHoursStructured?: OpeningHours;
  openingHoursLabel?: string;
  openingHoursTimezone?: string;
  priceLevel?: number;
  priceRange?: EnrichedPriceRange;
  imageUrl?: string;
  rating?: number;
  popularity?: number;
  officialUrl?: string;
  bookingUrl?: string;
  description?: string;
};

export type EnrichPlaceParams = {
  /** Logical place key (e.g. `google:ChIJ...` or stable dedupe hash). */
  cacheKey: string;
  /** Becomes {@link EnrichedPlace.id} unless `enrichedPlaceId` is set. */
  enrichedPlaceId?: string;
  contributions: readonly PlaceEnrichmentContribution[];
  /**
   * Manual corrections for `cacheKey` / entity; merged after external contributions
   * with {@link FieldConfidence} `user_override` so they beat providers and AI.
   */
  userCorrections?: readonly UserCorrection[];
  /**
   * When false (default), returns a prior merged result for `cacheKey` if present.
   * Set true when sources changed and the merge must run again.
   */
  forceRefresh?: boolean;
};
