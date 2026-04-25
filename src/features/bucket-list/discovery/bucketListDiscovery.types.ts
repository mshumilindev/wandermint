export type DiscoveryCategory =
  | "all"
  | "places"
  | "food"
  | "drinks"
  | "events"
  | "museums"
  | "nature"
  | "nightlife"
  | "hidden_gems"
  | "photo_spots"
  | "shopping"
  | "wellness"
  | "activities";

export type DiscoveryItemType =
  | "country"
  | "city"
  | "region"
  | "island"
  | "district"
  | "neighborhood"
  | "landmark"
  | "attraction"
  | "restaurant"
  | "cafe"
  | "bar"
  | "rooftop"
  | "nightlife"
  | "museum"
  | "gallery"
  | "architecture"
  | "historical_site"
  | "nature"
  | "park"
  | "beach"
  | "lake"
  | "mountain"
  | "viewpoint"
  | "hiking"
  | "food"
  | "drink"
  | "event"
  | "concert"
  | "festival"
  | "theatre"
  | "opera"
  | "exhibition"
  | "cinema"
  | "shopping"
  | "market"
  | "wellness"
  | "activity"
  | "photo_spot"
  | "hidden_gem"
  | "experience";

export type DiscoveryCoordinates = {
  lat: number;
  lng: number;
};

export type DiscoveryLocation = {
  name?: string;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  coordinates?: DiscoveryCoordinates;
};

export type DiscoveryEventInfo = {
  startDate?: string;
  endDate?: string;
  venueName?: string;
  venueAddress?: string;
};

export type DiscoveryItem = {
  id: string;
  title: string;
  description?: string;
  type: DiscoveryItemType;
  category?: DiscoveryCategory;
  imageUrl?: string;
  imageAlt: string;
  gallery?: string[];
  location?: DiscoveryLocation;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  source: {
    label: string;
    provider?: string;
    url?: string;
    isFallback?: boolean;
  };
  event?: DiscoveryEventInfo;
  tags: string[];
};

export type DiscoverySearchParams = {
  query: string;
  category?: DiscoveryCategory;
  locationHint?: string;
  limit?: number;
  externalEventSearchAllowed?: boolean;
};

export type DiscoverySearchResult = {
  items: DiscoveryItem[];
  source: string;
  query: string;
};

