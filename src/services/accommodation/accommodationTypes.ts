export type AccommodationProvider = "google_places" | "booking_demand" | "amadeus" | "static_fallback" | "openstreetmap";

export type AccommodationSearchContext = {
  city?: string;
  country?: string;
  coordinates?: { lat: number; lng: number };
  dateRange?: { start: string; end: string };
  adults?: number;
  rooms?: number;
  query: string;
};

export type AccommodationCandidate = {
  id: string;
  provider: AccommodationProvider;
  providerId: string;
  name: string;
  city?: string;
  country?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  imageUrl?: string;
  rating?: number;
  ratingSource?: "google" | "booking" | "amadeus" | "provider";
  reviewCount?: number;
  priceLevel?: number;
  estimatedPrice?: {
    min?: number;
    max?: number;
    currency?: string;
    certainty: "exact" | "estimated" | "unknown";
  };
  url?: string;
  categories: string[];
  sourceUpdatedAt: string;
  relevanceScore?: number;
  mergedFromProviders?: AccommodationProvider[];
};

export type WizardAccommodationBase = {
  mode: "resolved" | "custom";
  label: string;
  candidate?: AccommodationCandidate;
  customText?: string;
};
