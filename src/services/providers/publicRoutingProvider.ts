import type { MovementLeg, MovementOption, PlaceSnapshot } from "../../entities/activity/model";
import { createClientId } from "../../shared/lib/id";
import { haversineDistanceKm, resolveTransportTime } from "../../features/transport/transportTimeResolver";
import type { RouteContext, RoutingProvider } from "./contracts";
import { pricingService } from "../pricing/pricingService";

const hasCoordinates = (place: PlaceSnapshot): boolean => place.latitude !== undefined && place.longitude !== undefined;

const placeToPoint = (place: PlaceSnapshot): { lat: number; lng: number } => ({
  lat: place.latitude as number,
  lng: place.longitude as number,
});

const formatModeLabel = (mode: MovementOption["mode"]): string => {
  if (mode === "walking") {
    return "Walk";
  }
  if (mode === "public_transport") {
    return "Transit";
  }
  return "Taxi";
};

const distanceKm = (from: PlaceSnapshot, to: PlaceSnapshot): number => {
  if (!hasCoordinates(from) || !hasCoordinates(to)) {
    return 0;
  }
  return haversineDistanceKm(placeToPoint(from), placeToPoint(to));
};

const resultToOption = (
  mode: MovementOption["mode"],
  result: Awaited<ReturnType<typeof resolveTransportTime>>,
  distanceKmValue: number,
  from: PlaceSnapshot,
  to: PlaceSnapshot,
  sourceLabel: string,
): MovementOption => ({
  mode,
  durationMinutes: result.durationMinutes,
  estimatedCost: pricingService.estimateMovementCost({
    mode,
    distanceKm: distanceKmValue,
    durationMinutes: result.durationMinutes,
    city: from.city ?? to.city,
    country: from.country ?? to.country,
    place: from,
  }),
  certainty: result.confidence === "high" && result.source === "maps_api" ? "live" : "partial",
  sourceName: sourceLabel,
  estimateConfidence: result.confidence,
});

const buildMovementOptions = async (from: PlaceSnapshot, to: PlaceSnapshot): Promise<MovementLeg> => {
  const fromPt = placeToPoint(from);
  const toPt = placeToPoint(to);

  const [walkingR, drivingR, transitR] = await Promise.all([
    resolveTransportTime({ from: fromPt, to: toPt, mode: "walking" }),
    resolveTransportTime({ from: fromPt, to: toPt, mode: "driving" }),
    resolveTransportTime({ from: fromPt, to: toPt, mode: "transit" }),
  ]);

  const baseDistanceMeters =
    walkingR.distanceMeters ?? drivingR.distanceMeters ?? Math.round(haversineDistanceKm(fromPt, toPt) * 1000);
  const distanceKmValue = baseDistanceMeters / 1000;

  const walkingSource =
    walkingR.source === "maps_api" ? "OSRM walking route" : walkingR.source === "cached" ? "OSRM walking route (cached)" : "Route estimate";
  const drivingSource =
    drivingR.source === "maps_api" ? "OSRM driving route" : drivingR.source === "cached" ? "OSRM driving route (cached)" : "Route estimate";
  const transitSource =
    transitR.source === "maps_api"
      ? "OSRM road route with city transit estimate"
      : transitR.source === "cached"
        ? "Transit estimate (cached)"
        : "Route estimate";

  const taxiMinutes = drivingR.durationMinutes;
  const walkingOption = resultToOption("walking", walkingR, distanceKmValue, from, to, walkingSource);
  const transitOption = resultToOption("public_transport", transitR, distanceKmValue, from, to, transitSource);
  const taxiOption = resultToOption("taxi", { ...drivingR, durationMinutes: taxiMinutes }, distanceKmValue, from, to, drivingSource);

  const walkingMinutes = walkingR.durationMinutes;

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
    let walkingMinutes = 8;
    if (places.length >= 2 && places.every((place) => hasCoordinates(place as PlaceSnapshot))) {
      let total = 0;
      for (let index = 0; index < places.length - 1; index += 1) {
        const a = places[index] as PlaceSnapshot;
        const b = places[index + 1] as PlaceSnapshot;
        const r = await resolveTransportTime({
          from: placeToPoint(a),
          to: placeToPoint(b),
          mode: "walking",
        });
        total += r.durationMinutes;
      }
      walkingMinutes = Math.max(8, total);
    } else {
      const walkingKm = places.slice(1).reduce((total, place, index) => total + distanceKm(places[index] as PlaceSnapshot, place as PlaceSnapshot), 0);
      walkingMinutes = Math.max(8, Math.round((walkingKm / 5) * 60));
    }
    const certainty: RouteContext["certainty"] = places.every((place) => place.latitude !== undefined && place.longitude !== undefined)
      ? "partial"
      : "partial";

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
    const leg = await buildMovementOptions(from, to);
    return {
      ...leg,
      fromBlockId: "",
      toBlockId: "",
    };
  },
};
