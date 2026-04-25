/**
 * FlickSync library document shape under Firestore:
 * `profiles/{uid}/library/{itemId}`
 *
 * Status is derived from booleans — there is no single `status` field.
 * `externalRating` is a public catalogue rating, not a personal preference signal.
 */
export type FlickSyncMediaType = "movie" | "tv" | "game" | string;

export interface FlickSyncLibraryItem {
  id: string;
  provider: string;
  sourceId: string;
  mediaType: FlickSyncMediaType;
  title: string;
  description?: string;
  imageUrl?: string;
  /** Public / catalogue rating — do not use as user preference. */
  externalRating?: number;
  released?: boolean;
  releaseDate?: string;
  /** In FlickSync semantics: user is following this title. */
  isFavourite?: boolean;
  isWishlisted?: boolean;
  consumed?: boolean;
  consumeCount?: number;
  abandoned?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  seasons?: unknown;
  platforms?: unknown;
}
