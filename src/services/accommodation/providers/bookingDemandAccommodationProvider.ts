import type { AccommodationCandidate } from "../accommodationTypes";
import type { AccommodationSearchContext } from "../accommodationTypes";

/** Server-side Booking.com Demand API — not invoked from the browser build. */
export const searchBookingDemandAccommodations = async (_ctx: AccommodationSearchContext): Promise<AccommodationCandidate[]> => {
  void _ctx;
  return [];
};
