import { searchAllRegisteredPlaceProviders, type PlaceSearchContext } from "./placeProviderRegistry";
import type { PlaceCandidate } from "./placeTypes";

export type MustSeePlaceSearchInput = Pick<PlaceSearchContext, "query" | "city" | "country"> & {
  limit?: number;
};

/**
 * Debouncing lives in the UI; this function is safe to call on every keystroke from tests.
 */
export const searchPlacesForMustSee = async (input: MustSeePlaceSearchInput): Promise<PlaceCandidate[]> =>
  searchAllRegisteredPlaceProviders({
    query: input.query,
    city: input.city?.trim() || undefined,
    country: input.country?.trim() || undefined,
    limit: input.limit ?? 12,
  });

export type { PlaceCandidate };
