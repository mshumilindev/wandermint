import type { TravelMemory } from "../../entities/travel-memory/model";
import type { Trip } from "../../entities/trip/model";

/** Prefix for synthetic {@link Trip} ids derived from {@link TravelMemory} (no Firestore trip doc). */
export const TRAVEL_MEMORY_SYNTHETIC_TRIP_PREFIX = "travel-memory:" as const;

export const syntheticTripIdFromMemoryId = (memoryId: string): string => `${TRAVEL_MEMORY_SYNTHETIC_TRIP_PREFIX}${memoryId}`;

export const isSyntheticTravelMemoryTripId = (tripId: string): boolean => tripId.startsWith(TRAVEL_MEMORY_SYNTHETIC_TRIP_PREFIX);

export const isTravelMemoryEligibleForAggregates = (memory: TravelMemory): boolean =>
  Boolean(memory.city?.trim() && memory.country?.trim() && memory.startDate?.trim() && memory.endDate?.trim());

/**
 * Minimal completed {@link Trip} used wherever the app reasons about finished travel (journey map,
 * country filters, etc.). Not persisted — derived from {@link TravelMemory}.
 */
export const travelMemoryToSyntheticTrip = (memory: TravelMemory): Trip => {
  const city = memory.city.trim();
  const country = memory.country.trim();
  const title = memory.geoLabel?.trim() || `${city}, ${country}`;
  const ts = memory.updatedAt || memory.createdAt;
  return {
    id: syntheticTripIdFromMemoryId(memory.id),
    userId: memory.userId,
    title,
    destination: `${city}, ${country}`,
    tripSegments: [
      {
        id: "travel-memory-seg",
        city,
        country,
        startDate: memory.startDate,
        endDate: memory.endDate,
        hotelInfo: {},
      },
    ],
    dateRange: { start: memory.startDate, end: memory.endDate },
    flightInfo: {},
    hotelInfo: {},
    budget: { amount: 0, currency: "USD", style: "balanced" },
    preferences: {
      partyComposition: "couple",
      vibe: [],
      foodInterests: [],
      walkingTolerance: "medium",
      pace: "balanced",
      avoids: [],
      mustSeeNotes: "",
      specialWishes: "",
    },
    status: "completed",
    createdAt: memory.createdAt,
    updatedAt: ts,
    lastValidatedAt: null,
    planVersion: 0,
  };
};
