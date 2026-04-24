import { z } from "zod";
import type { MovementLeg, MovementOption, PlaceSnapshot } from "../../entities/activity/model";
import { createClientId } from "../../shared/lib/id";
import type { RouteContext, RoutingProvider } from "./contracts";
import { pricingService } from "../pricing/pricingService";

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const distanceKm = (from: PlaceSnapshot, to: PlaceSnapshot): number => {
  if (from.latitude === undefined || from.longitude === undefined || to.latitude === undefined || to.longitude === undefined) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const osrmRouteSchema = z.object({
  code: z.string(),
  routes: z.array(
    z.object({
      distance: z.number(),
      duration: z.number(),
    }),
  ),
});

const hasCoordinates = (place: PlaceSnapshot): boolean => place.latitude !== undefined && place.longitude !== undefined;

const formatModeLabel = (mode: MovementOption["mode"]): string => {
  if (mode === "walking") {
    return "Walk";
  }
  if (mode === "public_transport") {
    return "Transit";
  }
  return "Taxi";
};

const fallbackMovement = (from: PlaceSnapshot, to: PlaceSnapshot): MovementLeg => {
  const crowKm = distanceKm(from, to);
  const walkingMinutes = Math.max(8, Math.round((crowKm / 4.6) * 60));
  const primary: MovementOption =
    walkingMinutes <= 24
      ? { mode: "walking", durationMinutes: walkingMinutes, certainty: "partial", sourceName: "Distance estimate" }
      : {
          mode: "public_transport",
          durationMinutes: Math.max(12, Math.round(walkingMinutes * 0.5)),
          estimatedCost: pricingService.estimateMovementCost({
            mode: "public_transport",
            distanceKm: crowKm,
            city: from.city ?? to.city,
            country: from.country ?? to.country,
            place: from,
          }),
          certainty: "partial",
          sourceName: "Distance estimate",
        };

  return {
    id: createClientId("move"),
    fromBlockId: "",
    toBlockId: "",
    summary:
      primary.mode === "walking"
        ? `Walk about ${primary.durationMinutes} min`
        : `Transit about ${primary.durationMinutes} min`,
    distanceMeters: Math.round(crowKm * 1000),
    primary,
    alternatives: [],
  };
};
const fetchOsrmRoute = async (
  profile: "foot" | "driving",
  from: PlaceSnapshot,
  to: PlaceSnapshot,
): Promise<{ distanceMeters: number; durationMinutes: number } | null> => {
  if (!hasCoordinates(from) || !hasCoordinates(to)) {
    return null;
  }

  const url = `https://router.project-osrm.org/route/v1/${profile}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`;
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const parsed = osrmRouteSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.routes.length === 0) {
    return null;
  }

  return {
    distanceMeters: Math.round(parsed.data.routes[0]?.distance ?? 0),
    durationMinutes: Math.max(1, Math.round((parsed.data.routes[0]?.duration ?? 0) / 60)),
  };
};

const buildMovementOptions = (
  walkingRoute: { distanceMeters: number; durationMinutes: number } | null,
  drivingRoute: { distanceMeters: number; durationMinutes: number } | null,
  from: PlaceSnapshot,
  to: PlaceSnapshot,
): MovementLeg => {
  const fallback = fallbackMovement(from, to);
  const baseDistanceMeters = walkingRoute?.distanceMeters ?? drivingRoute?.distanceMeters ?? fallback.distanceMeters ?? 0;
  const walkingMinutes = walkingRoute?.durationMinutes ?? fallback.primary.durationMinutes;
  const taxiMinutes = drivingRoute?.durationMinutes ?? Math.max(6, Math.round(walkingMinutes * 0.42));
  const transitMinutes = Math.max(10, Math.round((drivingRoute?.durationMinutes ?? taxiMinutes) * 1.8 + 4));
  const distanceKmValue = baseDistanceMeters / 1000;

  const walkingOption: MovementOption = {
    mode: "walking",
    durationMinutes: walkingMinutes,
    estimatedCost: pricingService.estimateMovementCost({
      mode: "walking",
      distanceKm: distanceKmValue,
      city: from.city ?? to.city,
      country: from.country ?? to.country,
      place: from,
    }),
    certainty: walkingRoute ? "live" : "partial",
    sourceName: walkingRoute ? "OSRM walking route" : "Distance estimate",
  };
  const transitOption: MovementOption = {
    mode: "public_transport",
    durationMinutes: transitMinutes,
    estimatedCost: pricingService.estimateMovementCost({
      mode: "public_transport",
      distanceKm: distanceKmValue,
      city: from.city ?? to.city,
      country: from.country ?? to.country,
      place: from,
    }),
    certainty: drivingRoute ? "partial" : "partial",
    sourceName: drivingRoute ? "OSRM road route with city transit estimate" : "Distance estimate",
  };
  const taxiOption: MovementOption = {
    mode: "taxi",
    durationMinutes: taxiMinutes,
    estimatedCost: pricingService.estimateMovementCost({
      mode: "taxi",
      distanceKm: distanceKmValue,
      city: from.city ?? to.city,
      country: from.country ?? to.country,
      place: from,
    }),
    certainty: drivingRoute ? "live" : "partial",
    sourceName: drivingRoute ? "OSRM driving route" : "Distance estimate",
  };

  const primary =
    walkingMinutes <= 18
      ? walkingOption
      : baseDistanceMeters <= 2200
        ? transitOption
        : baseDistanceMeters <= 6500
          ? transitOption
          : taxiOption;

  const alternatives = [walkingOption, transitOption, taxiOption]
    .filter((option) => option.mode !== primary.mode)
    .filter((option) => option.mode !== "walking" || option.durationMinutes <= 35)
    .slice(0, 2);

  const costText = primary.estimatedCost && primary.estimatedCost.max > 0 ? ` · ${primary.estimatedCost.min}-${primary.estimatedCost.max} ${primary.estimatedCost.currency}` : "";

  return {
    id: createClientId("move"),
    fromBlockId: "",
    toBlockId: "",
    summary: `${formatModeLabel(primary.mode)} about ${primary.durationMinutes} min${costText}`,
    distanceMeters: baseDistanceMeters,
    primary,
    alternatives,
  };
};

export const publicRoutingProvider: RoutingProvider = {
  estimateRoute: async (places) => {
    const walkingKm = places.slice(1).reduce((total, place, index) => total + distanceKm(places[index] as PlaceSnapshot, place), 0);
    const walkingMinutes = Math.max(8, Math.round((walkingKm / 4.5) * 60));
    const certainty: RouteContext["certainty"] = places.every((place) => place.latitude !== undefined && place.longitude !== undefined) ? "partial" : "partial";

    return {
      summary:
        walkingMinutes <= 28
          ? `The route holds together on foot in about ${walkingMinutes} minutes overall.`
          : `The route spreads out a little more, with roughly ${walkingMinutes} minutes of movement overall.`,
      walkingMinutes,
      certainty,
    };
  },
  estimateMovement: async (from, to) => {
    const [walkingRoute, drivingRoute] = await Promise.all([
      fetchOsrmRoute("foot", from, to).catch(() => null),
      fetchOsrmRoute("driving", from, to).catch(() => null),
    ]);

    const leg = buildMovementOptions(walkingRoute, drivingRoute, from, to);
    return {
      ...leg,
      fromBlockId: "",
      toBlockId: "",
    };
  },
};
