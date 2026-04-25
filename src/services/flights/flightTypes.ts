export type AirportInfo = {
  code: string;
  name?: string;
  city?: string;
  country?: string;
  timezone?: string;
  coordinates?: { lat: number; lng: number };
};

/** Backward-compatible alias used by existing airport catalog helpers. */
export type Airport = {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
};

export type FlightSegment = {
  id: string;
  flightNumber: string;
  airline?: string;
  departureAirport: AirportInfo;
  arrivalAirport: AirportInfo;
  scheduledDepartureTime?: string;
  scheduledArrivalTime?: string;
  actualDepartureTime?: string;
  actualArrivalTime?: string;
  departureTerminal?: string;
  arrivalTerminal?: string;
  status?: "scheduled" | "active" | "landed" | "delayed" | "cancelled" | "unknown";
  dataConfidence: "high" | "medium" | "low";
  sourceProvider: string;
  /** Legacy fields kept for compatibility with existing hints/services. */
  departureTime?: string;
  arrivalTime?: string;
};

export type FlightLookupResult = {
  status: "found" | "not_found" | "provider_unavailable" | "partial";
  sourceProvider:
    | "existing"
    | "aviationstack"
    | "aerodatabox"
    | "opensky"
    | "aviation_edge"
    | "manual"
    | "unavailable";
  flightNumber: string;
  segments: FlightSegment[];
  warnings: string[];
};

export type LayoverFeasibility =
  | "unknown"
  | "airport_only"
  | "short_airport_walk"
  | "near_airport"
  | "city_walk_possible"
  | "city_visit_recommended"
  | "airport_transfer_connection";

export type LayoverMiniPlan = {
  title: string;
  city?: string;
  durationMinutes: number;
  items: Array<{
    title: string;
    description?: string;
    type:
      | "food"
      | "coffee"
      | "walk"
      | "viewpoint"
      | "museum"
      | "market"
      | "near_airport"
      | "airport_lounge"
      | "airport_terminal";
    estimatedMinutes: number;
  }>;
  safetyNotes: string[];
};

export type LayoverAnalysis = {
  id: string;
  airport: AirportInfo;
  previousFlight: FlightSegment;
  nextFlight: FlightSegment;
  arrivalTime?: string;
  departureTime?: string;
  durationMinutes?: number;
  feasibility: LayoverFeasibility;
  estimatedAirportExitMinutes: number;
  estimatedReturnBufferMinutes: number;
  estimatedCityTransferMinutes?: number;
  usableFreeTimeMinutes?: number;
  confidence: "high" | "medium" | "low";
  recommendationTitle: string;
  recommendationDescription: string;
  suggestedMiniPlan?: LayoverMiniPlan;
  warnings: string[];
};

export type LayoverContext = {
  source: "flight_lookup" | "manual" | "mixed";
  flightLookupStatus: FlightLookupResult["status"];
  segments: FlightSegment[];
  hasLayovers: boolean;
  layovers: LayoverAnalysis[];
  warnings: string[];
  originalFlightNumbers?: string[];
};
