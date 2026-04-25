import type { BucketListItem } from "./bucketList.types";
import { bucketListItemMapCoordinates } from "./bucketListNormalize";

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Fuzzy key when neither merge side relies on `entityId` — must stay aligned with
 * {@link bucketListService.addOrUpdateItem} duplicate detection.
 */
export const bucketListFuzzyMergeKey = (item: BucketListItem): string => {
  if (item.payload.type === "experience") {
    return `exp:${item.payload.label.trim().toLowerCase()}`;
  }
  const t = item.title.trim().toLowerCase();
  const coords = bucketListItemMapCoordinates(item);
  if (coords) {
    return `${t}|${round4(coords.lat)}|${round4(coords.lng)}`;
  }
  return t;
};

/**
 * One logical bucket place per key — used for achievement progress so the same place
 * cannot be double-counted across duplicate rows or revisit toggles.
 */
export const bucketListAchievementDedupeKey = (item: Pick<BucketListItem, "id" | "entityId" | "title" | "location" | "payload">): string => {
  const eid = item.entityId?.trim();
  if (eid) {
    return `e:${eid}`;
  }
  return `f:${bucketListFuzzyMergeKey(item as BucketListItem)}`;
};

export const countVisitedBucketPlacesDeduped = (rows: readonly BucketListItem[]): number => {
  const keys = new Set<string>();
  for (const r of rows) {
    if (!r.visited || r.payload.type === "experience") {
      continue;
    }
    keys.add(bucketListAchievementDedupeKey(r));
  }
  return keys.size;
};

export const countBucketPlacesDeduped = (rows: readonly BucketListItem[]): number => {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.payload.type === "experience") {
      continue;
    }
    keys.add(bucketListAchievementDedupeKey(r));
  }
  return keys.size;
};
