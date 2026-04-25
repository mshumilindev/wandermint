export type ResolvedEntityType = "place" | "event" | "venue" | "city";

/**
 * Canonical record for a deduped real-world entity.
 * Optional `eventKey` is set for `type: "event"` and drives date + venue + title matching.
 */
export type ResolvedEntity = {
  canonicalId: string;
  canonicalName: string;
  aliases: string[];
  type: ResolvedEntityType;
  coordinates?: {
    lat: number;
    lng: number;
  };
  confidenceScore: number;
  sources: string[];
  /** Present for events — normalized fields used only for resolution / dedup (not for display). */
  eventKey?: {
    dateYmd: string;
    venueNormalized: string;
    titleNormalized: string;
  };
};

export type DeduplicateEntitiesOptions = {
  /** Minimum merge compatibility score in `[0, 1]` (default 0.72). */
  mergeThreshold?: number;
  /** Entities at or below this confidence are never merged with anything (default 0.38). */
  lowConfidenceMergeCutoff?: number;
  /** Max great-circle distance (m) to treat two places/venues as the same when names are compatible (default 450). */
  maxPlaceDistanceMeters?: number;
};
