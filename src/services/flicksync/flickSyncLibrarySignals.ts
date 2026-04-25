import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";

/** Derived planning / scoring tags — an item may contribute several at once. */
export type FlickSyncDerivedStatus = "abandoned" | "watched" | "played" | "following" | "wishlist";

/**
 * Maps FlickSync boolean fields to derived status tags.
 * Multiple flags can be true simultaneously (e.g. watched + following stacks for scoring).
 */
export const deriveFlickSyncStatuses = (item: FlickSyncLibraryItem): FlickSyncDerivedStatus[] => {
  const statuses: FlickSyncDerivedStatus[] = [];

  if (item.abandoned === true) {
    statuses.push("abandoned");
  }
  if (item.consumed === true) {
    statuses.push(item.mediaType === "game" ? "played" : "watched");
  }
  if (item.isFavourite === true) {
    statuses.push("following");
  }
  if (item.isWishlisted === true) {
    statuses.push("wishlist");
  }

  return statuses;
};

/**
 * Interest weight for ranking or prompt prioritisation.
 * Does not use `externalRating` — that is public metadata, not user taste.
 */
export const scoreFlickSyncLibraryInterest = (item: FlickSyncLibraryItem): number => {
  const statuses = deriveFlickSyncStatuses(item);
  let score = 0;

  if (statuses.includes("watched") || statuses.includes("played")) {
    score += 5;
  }
  if (statuses.includes("following")) {
    score += 4;
  }
  if (statuses.includes("wishlist")) {
    score += 3;
  }

  if (item.consumed === true) {
    const count = item.consumeCount ?? 0;
    if (count >= 3) {
      score += 4;
    } else if (count === 2) {
      score += 2;
    }
  }

  if (statuses.includes("abandoned")) {
    score -= 6;
  }

  return score;
};
