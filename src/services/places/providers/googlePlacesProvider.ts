import type { PlaceCandidate } from "../placeTypes";

/**
 * Google Places-backed search is not wired in this build (keys / billing).
 * Returns an empty list so the aggregator never throws and OSM can still answer.
 */
export const searchGooglePlaces = async (_ctx: {
  query: string;
  city?: string;
  country?: string;
  limit?: number;
}): Promise<PlaceCandidate[]> => [];
