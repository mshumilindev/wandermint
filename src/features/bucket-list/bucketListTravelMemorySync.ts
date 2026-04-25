import type { TravelMemory } from "../../entities/travel-memory/model";
import { isTravelMemoryEligibleForAggregates } from "../travel-stats/travelMemoryTripEquivalence";
import { bucketListRepository } from "./bucketListRepository";
import { bucketListItemCityCountry } from "./bucketListNormalize";
import { bucketListService } from "./bucketListService";

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * When a user records a past trip in Travel memory, treat it like a real visit for bucket list:
 * mark matching destination / place / event rows in the same city+country as visited.
 */
export const syncBucketListVisitedFromTravelMemory = async (userId: string, memory: TravelMemory): Promise<void> => {
  const uid = userId.trim();
  if (!uid || !isTravelMemoryEligibleForAggregates(memory)) {
    return;
  }
  const mc = norm(memory.city);
  const mctry = norm(memory.country);

  const items = await bucketListRepository.listByUserId(uid);
  for (const row of items) {
    if (row.visited) {
      continue;
    }
    if (row.payload.type === "experience") {
      continue;
    }
    const cc = bucketListItemCityCountry(row);
    const cCity = cc.city ? norm(cc.city) : "";
    const cCountry = cc.country ? norm(cc.country) : "";
    if (!cCity || !cCountry) {
      continue;
    }
    if (cCity === mc && cCountry === mctry) {
      await bucketListService.markVisitedFromTrip(uid, row.id);
    }
  }
};
