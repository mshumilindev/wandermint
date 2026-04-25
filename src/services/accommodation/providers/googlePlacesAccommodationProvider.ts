import type { AccommodationCandidate } from "../accommodationTypes";
import type { AccommodationSearchContext } from "../accommodationTypes";

/**
 * Browser-safe Google Places integration belongs behind your own backend proxy.
 * This stub keeps the wizard functional without shipping secrets or scraping third parties.
 */
export const searchGooglePlacesAccommodations = async (_ctx: AccommodationSearchContext): Promise<AccommodationCandidate[]> => {
  void _ctx;
  return [];
};
