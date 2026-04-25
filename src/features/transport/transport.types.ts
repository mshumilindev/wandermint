export type TransportMode = "walking" | "transit" | "taxi" | "driving";

export type TransportTimeRequest = {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  mode: TransportMode;
  /** Optional ISO instant or local composite string; included in cache key when set. */
  departureTime?: string;
};

export type TransportTimeResult = {
  durationMinutes: number;
  distanceMeters?: number;
  source: "maps_api" | "cached" | "estimated";
  confidence: "high" | "medium" | "low";
};
