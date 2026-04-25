import { z } from "zod";

import type { TransportMode, TransportTimeRequest, TransportTimeResult } from "./transport.types";
import { getTransportTimeCached, setTransportTimeCached, transportTimeCacheKey } from "./transportCache";

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const haversineDistanceKm = (from: { lat: number; lng: number }, to: { lat: number; lng: number }): number => {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const SPEED_KMH: Record<TransportMode, number> = {
  walking: 5,
  transit: 18,
  taxi: 25,
  driving: 25,
};

const osrmRouteSchema = z.object({
  routes: z.array(
    z.object({
      distance: z.number(),
      duration: z.number(),
    }),
  ),
});

const fetchOsrmRoute = async (
  profile: "foot" | "driving",
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<{ distanceMeters: number; durationMinutes: number } | null> => {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const parsed = osrmRouteSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.routes.length === 0) {
      return null;
    }
    const route = parsed.data.routes[0];
    if (!route) {
      return null;
    }
    return {
      distanceMeters: Math.round(route.distance),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
};

const osrmProfileForMode = (mode: TransportMode): "foot" | "driving" | null => {
  if (mode === "walking") {
    return "foot";
  }
  if (mode === "driving" || mode === "taxi") {
    return "driving";
  }
  return null;
};

const deterministicEstimate = (request: TransportTimeRequest): TransportTimeResult => {
  const km = haversineDistanceKm(request.from, request.to);
  const distanceMeters = Math.round(km * 1000);
  const speed = SPEED_KMH[request.mode];
  const rawMinutes = (km / speed) * 60;
  const durationMinutes = km < 1e-8 ? Math.max(5, Math.round(rawMinutes)) : Math.max(1, Math.round(rawMinutes));
  return {
    durationMinutes,
    distanceMeters,
    source: "estimated",
    confidence: "low",
  };
};

const mergeCached = (value: TransportTimeResult): TransportTimeResult => ({
  ...value,
  source: "cached",
});

/**
 * Synchronous estimate: cache hit (e.g. after async routing) or deterministic fallback (no network).
 * Does not write to the cache (async {@link resolveTransportTime} owns writes).
 */
export const estimateTransportTimeSync = (request: TransportTimeRequest): TransportTimeResult => {
  const key = transportTimeCacheKey(request);
  const hit = getTransportTimeCached(key);
  if (hit) {
    return mergeCached(hit);
  }
  return deterministicEstimate(request);
};

/**
 * Resolves travel time with OSRM where applicable, otherwise deterministic city defaults (low confidence).
 * Results are cached per rounded coordinate pair, mode, and optional departure.
 */
export const resolveTransportTime = async (request: TransportTimeRequest): Promise<TransportTimeResult> => {
  const key = transportTimeCacheKey(request);
  const hit = getTransportTimeCached(key);
  if (hit) {
    return mergeCached(hit);
  }

  const profile = osrmProfileForMode(request.mode);
  if (profile) {
    const routed = await fetchOsrmRoute(profile, request.from, request.to);
    if (routed) {
      const result: TransportTimeResult = {
        durationMinutes: routed.durationMinutes,
        distanceMeters: routed.distanceMeters,
        source: "maps_api",
        confidence: "high",
      };
      setTransportTimeCached(key, result);
      return result;
    }
  }

  const fallback = deterministicEstimate(request);
  setTransportTimeCached(key, fallback);
  return fallback;
};

/** Default gap when reordering blocks without coordinates (minutes). */
export const DEFAULT_INTER_BLOCK_TRAVEL_MINUTES = 12;

/**
 * Walking estimate between two blocks for UI reordering when coordinates exist; otherwise {@link DEFAULT_INTER_BLOCK_TRAVEL_MINUTES}.
 */
export const estimateInterBlockWalkingGapMinutes = (
  from: { lat: number; lng: number } | undefined,
  to: { lat: number; lng: number } | undefined,
  departureTime?: string,
): number => {
  if (!from || !to) {
    return DEFAULT_INTER_BLOCK_TRAVEL_MINUTES;
  }
  return estimateTransportTimeSync({
    from,
    to,
    mode: "walking",
    departureTime,
  }).durationMinutes;
};
