import { searchAmadeusAccommodations } from "./providers/amadeusAccommodationProvider";
import { searchBookingDemandAccommodations } from "./providers/bookingDemandAccommodationProvider";
import { searchGooglePlacesAccommodations } from "./providers/googlePlacesAccommodationProvider";
import { searchOsmAccommodations } from "./providers/osmAccommodationProvider";
import { searchStaticAccommodationFallback } from "./providers/staticAccommodationFallbackProvider";
import type { AccommodationCandidate } from "./accommodationTypes";
import type { AccommodationSearchContext } from "./accommodationTypes";

type ProviderFn = (ctx: AccommodationSearchContext) => Promise<AccommodationCandidate[]>;

export const accommodationProviderOrder: Array<{ id: string; fn: ProviderFn }> = [
  { id: "google_places", fn: searchGooglePlacesAccommodations },
  { id: "booking_demand", fn: searchBookingDemandAccommodations },
  { id: "amadeus", fn: searchAmadeusAccommodations },
  { id: "openstreetmap", fn: searchOsmAccommodations },
  { id: "static_fallback", fn: searchStaticAccommodationFallback },
];
