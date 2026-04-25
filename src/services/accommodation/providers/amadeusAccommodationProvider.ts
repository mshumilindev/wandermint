import type { AccommodationCandidate } from "../accommodationTypes";
import type { AccommodationSearchContext } from "../accommodationTypes";

/** Amadeus hotel search requires server credentials — stub in the SPA. */
export const searchAmadeusAccommodations = async (_ctx: AccommodationSearchContext): Promise<AccommodationCandidate[]> => {
  void _ctx;
  return [];
};
