import type { CostRange, MovementLeg, PlaceSnapshot } from "../../entities/activity/model";

export interface GeoPoint {
  latitude: number;
  longitude: number;
  label: string;
}

export interface CitySearchResult extends GeoPoint {
  city: string;
  country: string;
  region?: string;
}

export interface WeatherContext {
  locationLabel: string;
  temperatureC: number;
  condition: string;
  precipitationChance: number;
  windKph: number;
  observedAt: string;
  certainty: "live" | "partial";
}

export interface PlaceSearchInput {
  locationLabel: string;
  latitude?: number;
  longitude?: number;
  query: string;
  categories: string[];
  indoorPreferred?: boolean;
  radiusMeters?: number;
}

export type DiscoveryCategory =
  | "attractions"
  | "museums"
  | "local_food"
  | "traditional_drinks"
  | "nearby_places"
  | "day_trips"
  | "must_see";

export interface DestinationDiscoveryInput {
  locationLabel: string;
  segments: Array<{
    city: string;
    country: string;
  }>;
  mustSeeNotes?: string;
}

export interface DiscoveryItem {
  id: string;
  category: DiscoveryCategory;
  title: string;
  description?: string;
  place?: PlaceSnapshot;
  sourceName: string;
  sourceUrl?: string;
  confidence: "low" | "medium" | "high";
  tags: string[];
}

export interface DestinationDiscovery {
  locationLabel: string;
  capturedAt: string;
  attractions: DiscoveryItem[];
  museums: DiscoveryItem[];
  localFood: DiscoveryItem[];
  traditionalDrinks: DiscoveryItem[];
  nearbyPlaces: DiscoveryItem[];
  dayTrips: DiscoveryItem[];
  mustSee: DiscoveryItem[];
}

export interface RouteContext {
  summary: string;
  walkingMinutes: number;
  transitMinutes?: number;
  certainty: "live" | "partial";
}

export interface GeocodingProvider {
  geocode: (locationLabel: string) => Promise<GeoPoint>;
  reverseGeocode: (latitude: number, longitude: number) => Promise<GeoPoint>;
  searchCities: (query: string, options?: { limit?: number }) => Promise<CitySearchResult[]>;
}

export interface EventContext {
  title: string;
  venue: string;
  startsAt: string;
  category: string;
  priceRange: CostRange;
  sourceName: string;
}

export interface WeatherProvider {
  getCurrentWeather: (locationLabel: string) => Promise<WeatherContext>;
  getCurrentWeatherAt: (point: GeoPoint) => Promise<WeatherContext>;
  getForecast: (locationLabel: string, dateRange: { start: string; end: string }) => Promise<WeatherContext[]>;
}

export interface PlacesProvider {
  searchPlaces: (input: PlaceSearchInput) => Promise<PlaceSnapshot[]>;
}

export interface DestinationDiscoveryProvider {
  getDestinationDiscovery: (input: DestinationDiscoveryInput) => Promise<DestinationDiscovery>;
}

export interface RoutingProvider {
  estimateRoute: (places: PlaceSnapshot[]) => Promise<RouteContext>;
  estimateMovement: (from: PlaceSnapshot, to: PlaceSnapshot) => Promise<MovementLeg>;
}

export interface EventsProvider {
  findEvents: (locationLabel: string, date: string) => Promise<EventContext[]>;
}
