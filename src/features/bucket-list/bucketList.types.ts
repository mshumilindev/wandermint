import type { PlaceCandidate } from "../../services/places/placeTypes";
import type { TripEvent } from "../../services/events/tripEventTypes";

/** Geographic anchor for a dream destination (city-level). */
export type BucketListLocation = {
  city: string;
  country: string;
  coordinates?: { lat: number; lng: number };
};

/**
 * Structured bucket entry — only `experience` is free-text; all other kinds are typed.
 * Alias: {@link BucketItem} matches product language.
 */
export type BucketListPayload =
  | { type: "destination"; location: BucketListLocation }
  | { type: "place"; place: PlaceCandidate }
  | { type: "experience"; label: string }
  | { type: "event"; event: TripEvent };

export type BucketItem = BucketListPayload;

/** Legacy Firestore `type` field before schema v2. */
export type BucketListItemType = "place" | "event" | "experience" | "custom";

export type BucketListItemSource = "manual" | "trip_saved" | "recommendation" | "imported";

export type BucketListPriority = "high" | "medium" | "low";

export type BucketListSchemaVersion = 2;

export type BucketListItem = {
  id: string;
  userId: string;
  schemaVersion: BucketListSchemaVersion;
  payload: BucketListPayload;

  /** Denormalized for search, cards, and Firestore queries. */
  title: string;
  entityId?: string;
  location?: {
    lat: number;
    lng: number;
    city?: string;
    country?: string;
  };

  category?: string;
  tags?: string[];

  source: BucketListItemSource;
  priority: BucketListPriority;

  visited: boolean;
  visitedAt?: string;

  /** Bumps on save/add merges — homepage frequency signal. */
  touchCount: number;
  lastTouchedAt: string;

  createdAt: string;
  updatedAt: string;
};

export type AddBucketListItemInput = {
  userId: string;
  payload: BucketListPayload;
  entityId?: string;
  category?: string;
  tags?: string[];
  source: BucketListItemSource;
  priority: BucketListPriority;
  visited?: boolean;
  visitedAt?: string;
  id?: string;
};
