import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { PlaceCandidate, PlaceProviderId } from "../../services/places/placeTypes";
import type { AddBucketListItemInput, BucketListItem, BucketListPayload } from "./bucketList.types";
import { bucketListService } from "./bucketListService";
import { bucketListRepository } from "./bucketListRepository";

const entityIdFromBlock = (block: ActivityBlock): string | undefined => {
  const pid = block.place?.providerPlaceId?.trim();
  const provider = block.place?.provider?.trim();
  if (pid && provider) {
    return `${provider}:${pid}`;
  }
  return pid || undefined;
};

const placeCandidateFromBlock = (block: ActivityBlock): PlaceCandidate | null => {
  const p = block.place;
  if (!p?.name?.trim()) {
    return null;
  }
  const lat = p.latitude;
  const lng = p.longitude;
  const provRaw = p.provider?.trim() ?? "osm";
  const provider: PlaceProviderId = provRaw === "google_places" ? "google_places" : "osm";
  const providerId = p.providerPlaceId?.trim() || `trip-block:${block.id}`;
  return {
    id: `${provider}:${providerId}`,
    provider,
    providerId,
    name: p.name.trim(),
    city: p.city,
    country: p.country,
    coordinates: lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
    categories: block.category ? [block.category] : [],
  };
};

const inferPayloadFromBlock = (block: ActivityBlock): BucketListPayload => {
  if (block.type === "rest" || block.type === "transfer") {
    return { type: "experience", label: block.title.trim() || "Travel moment" };
  }
  const place = placeCandidateFromBlock(block);
  if (place) {
    return { type: "place", place };
  }
  if (block.type === "meal") {
    return { type: "experience", label: block.title.trim() || "Dining wish" };
  }
  return { type: "experience", label: block.title.trim() || "Saved" };
};

/**
 * Builds a bucket row from a trip plan block (Rule 8 — trip plan source).
 */
export const buildBucketListInputFromTripBlock = (userId: string, block: ActivityBlock, _day: DayPlan): AddBucketListItemInput => ({
  userId,
  entityId: entityIdFromBlock(block),
  payload: inferPayloadFromBlock(block),
  category: block.category,
  tags: block.tags.length > 0 ? [...block.tags] : undefined,
  source: "trip_saved",
  priority: block.priority === "must" ? "high" : block.priority === "should" ? "medium" : "low",
});

/**
 * Saves a recommendation-shaped row (Rule 8).
 */
export const buildBucketListInputFromRecommendation = (input: {
  userId: string;
  payload: BucketListPayload;
  entityId?: string;
  category?: string;
  tags?: string[];
  priority?: BucketListItem["priority"];
}): AddBucketListItemInput => ({
  userId: input.userId,
  payload: input.payload,
  entityId: input.entityId,
  category: input.category,
  tags: input.tags,
  source: "recommendation",
  priority: input.priority ?? "medium",
});

/**
 * When a trip activity is completed, mark any matching bucket list entry visited (Rules 4–5).
 * Matching: `entityId` first, else same-day fuzzy title + coordinates.
 */
export const syncBucketListVisitedFromCompletedBlock = async (
  userId: string,
  block: ActivityBlock,
  _day: DayPlan,
): Promise<BucketListItem | null> => {
  const uid = userId.trim();
  if (!uid) {
    return null;
  }
  const eid = entityIdFromBlock(block);
  if (eid) {
    const hit = await bucketListRepository.findByEntityId(uid, eid);
    if (hit) {
      return bucketListService.markVisitedFromTrip(uid, hit.id);
    }
  }

  const all = await bucketListRepository.listByUserId(uid);
  const lat = block.place?.latitude;
  const lng = block.place?.longitude;
  const titleLower = block.title.trim().toLowerCase();
  const fuzzy =
    typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
      ? all.find((row) => {
          if (row.visited) {
            return false;
          }
          const rowTitle = row.title.trim().toLowerCase();
          if (rowTitle !== titleLower) {
            return false;
          }
          if (!row.location || !Number.isFinite(row.location.lat) || !Number.isFinite(row.location.lng)) {
            return false;
          }
          return Math.abs(row.location.lat - lat) < 0.0002 && Math.abs(row.location.lng - lng) < 0.0002;
        })
      : all.find((row) => !row.visited && row.title.trim().toLowerCase() === titleLower);

  if (fuzzy) {
    return bucketListService.markVisitedFromTrip(uid, fuzzy.id);
  }
  return null;
};

/**
 * One-shot: add from trip plan with dedupe (Rule 8).
 */
export const saveTripBlockToBucketList = async (userId: string, block: ActivityBlock, day: DayPlan): Promise<BucketListItem> => {
  return bucketListService.addOrUpdateItem(userId, buildBucketListInputFromTripBlock(userId, block, day));
};
