import type { IntercityMove, TripSegment } from "../../entities/trip/model";
import { createClientId } from "../../shared/lib/id";
import { publicGeoProvider } from "../providers/publicGeoProvider";
import { pricingService } from "../pricing/pricingService";
import { practicalRegions } from "./practicalRegions";

interface SegmentPoint {
  segment: TripSegment;
  latitude?: number;
  longitude?: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const distanceKm = (from: SegmentPoint, to: SegmentPoint): number | null => {
  if (from.latitude === undefined || from.longitude === undefined || to.latitude === undefined || to.longitude === undefined) {
    return null;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const officialSourceHint = (fromCountry: string, toCountry: string, type: "train" | "flight" | "bus" | "ferry" | "custom"): string => {
  const countries = `${fromCountry} ${toCountry}`.toLowerCase();
  if (countries.includes("japan")) {
    return "Verify fares with official JR operator sources such as JR Central/JR West Smart EX, JR East, or the relevant regional rail operator.";
  }
  if (countries.includes("germany")) {
    return "Verify fares with Deutsche Bahn or the official national/regional rail operator.";
  }
  if (countries.includes("france")) {
    return "Verify fares with SNCF Connect or the official rail operator.";
  }
  if (countries.includes("italy")) {
    return "Verify fares with Trenitalia or Italo official booking channels.";
  }
  if (countries.includes("spain")) {
    return "Verify fares with Renfe or the official rail operator.";
  }
  if (countries.includes("united kingdom") || countries.includes("england") || countries.includes("scotland")) {
    return "Verify fares with National Rail or the official train operator.";
  }
  if (countries.includes("united states") || countries.includes("usa")) {
    return type === "train" ? "Verify fares with Amtrak or official regional rail operators." : "Verify fares with airline or bus operator official booking channels.";
  }
  return type === "flight"
    ? "Verify fares with airline official booking channels and airport transfer operators."
    : "Verify fares with official rail, bus, ferry, or transport operator sources before booking.";
};

const estimateCost = (
  distance: number | null,
  type: "train" | "flight" | "bus" | "ferry" | "custom",
  currency: string,
): { min: number; max: number; currency: string; approximate: boolean } => {
  const safeDistance = distance ?? (type === "flight" ? 850 : 260);
  if (type === "bus") {
    return { min: Math.round(Math.max(12, safeDistance * 0.05)), max: Math.round(Math.max(35, safeDistance * 0.16)), currency, approximate: true };
  }
  if (type === "train") {
    return { min: Math.round(Math.max(25, safeDistance * 0.1)), max: Math.round(Math.max(75, safeDistance * 0.28)), currency, approximate: true };
  }
  if (type === "flight") {
    return { min: Math.round(Math.max(80, 65 + safeDistance * 0.04)), max: Math.round(Math.max(220, 180 + safeDistance * 0.12)), currency, approximate: true };
  }
  return { min: Math.round(Math.max(20, safeDistance * 0.08)), max: Math.round(Math.max(90, safeDistance * 0.24)), currency, approximate: true };
};

const chooseTransportType = (distance: number | null, isSameRegion: boolean): "train" | "flight" | "bus" => {
  if (distance !== null && distance <= 180) {
    return "bus";
  }
  if (distance !== null && distance <= 720 && isSameRegion) {
    return "train";
  }
  if (distance === null && isSameRegion) {
    return "train";
  }
  return "flight";
};

const linehaulMinutes = (distance: number | null, type: "train" | "flight" | "bus" | "ferry" | "custom"): number => {
  const safeDistance = distance ?? (type === "flight" ? 850 : 320);
  if (type === "bus") {
    return Math.round(Math.max(70, (safeDistance / 70) * 60));
  }
  if (type === "train") {
    return Math.round(Math.max(65, (safeDistance / 145) * 60));
  }
  if (type === "flight") {
    return Math.round(Math.max(75, (safeDistance / 760) * 60));
  }
  return Math.round(Math.max(60, (safeDistance / 60) * 60));
};

const transferMinutes = (type: "train" | "flight" | "bus" | "ferry" | "custom"): number => {
  if (type === "flight") {
    return 150;
  }
  if (type === "train") {
    return 55;
  }
  if (type === "bus") {
    return 35;
  }
  return 60;
};

const bufferMinutes = (type: "train" | "flight" | "bus" | "ferry" | "custom", distance: number | null): number => {
  if (type === "flight") {
    return 120;
  }
  if (type === "train") {
    return distance !== null && distance > 500 ? 75 : 45;
  }
  if (type === "bus") {
    return 35;
  }
  return 60;
};

const feasibility = (totalMinutes: number): "easy" | "possible" | "tight" | "risky" | "unrealistic" => {
  if (totalMinutes <= 210) {
    return "easy";
  }
  if (totalMinutes <= 360) {
    return "possible";
  }
  if (totalMinutes <= 540) {
    return "tight";
  }
  if (totalMinutes <= 720) {
    return "risky";
  }
  return "unrealistic";
};

const geocodeSegment = async (segment: TripSegment): Promise<SegmentPoint> => {
  try {
    const point = await publicGeoProvider.geocode(`${segment.city}, ${segment.country}`);
    return { segment, latitude: point.latitude, longitude: point.longitude };
  } catch {
    return { segment };
  }
};

export const intercityTransportService = {
  createMoves: async (segments: TripSegment[], currency: string): Promise<IntercityMove[]> => {
    const points = await Promise.all(segments.map((segment) => geocodeSegment(segment)));
    return points.slice(1).map((point, index) => {
      const previous = points[index];
      const distance = previous ? distanceKm(previous, point) : null;
      const isSameRegion = previous ? practicalRegions.isRegionCompatible(previous.segment.country, point.segment.country) : false;
      const type = chooseTransportType(distance, isSameRegion);
      const estimatedDurationMinutes = linehaulMinutes(distance, type);
      const stationOrAirportTransferMinutes = transferMinutes(type);
      const candidateBufferMinutes = bufferMinutes(type, distance);
      const totalMovementMinutes = estimatedDurationMinutes + stationOrAirportTransferMinutes + candidateBufferMinutes;
      const localCurrency =
        pricingService.resolvePricingProfile({
          city: point.segment.city,
          country: point.segment.country,
          locationLabel: `${point.segment.city}, ${point.segment.country}`,
        }).profile.currency || currency;

      return {
        id: createClientId("move"),
        fromSegmentId: previous?.segment.id ?? "",
        toSegmentId: point.segment.id,
        transportCandidates: [
          {
            type,
            estimatedDurationMinutes,
            stationOrAirportTransferMinutes,
            bufferMinutes: candidateBufferMinutes,
            baggageFriction: type === "flight" ? "high" : type === "train" ? "medium" : "low",
            estimatedCost: estimateCost(distance, type, localCurrency),
            sourceSnapshot: [
              `Approximate movement estimate${distance !== null ? ` based on about ${Math.round(distance)} km between city centers` : " using regional distance assumptions"}.`,
              `Total movement window is about ${Math.round(totalMovementMinutes / 15) * 15} minutes including line-haul time, transfers, and buffer.`,
              officialSourceHint(previous?.segment.country ?? "", point.segment.country, type),
            ].join(" "),
            feasibility: feasibility(totalMovementMinutes),
          },
        ],
      };
    });
  },
};
