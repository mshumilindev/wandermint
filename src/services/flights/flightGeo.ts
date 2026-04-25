import type { Airport } from "./flightTypes";
import { AIRPORTS, getAirportByIata } from "./airportCatalog";

const EARTH_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_KM * c;
};

/**
 * Rough surface leg (airport ↔ city orbit), not routing-engine precise.
 * Adds fixed airport terminal / curb friction.
 */
export const estimateSurfaceLegMinutes = (from: Airport, to: Airport): number => {
  const km = haversineKm(from.coordinates, to.coordinates);
  const base = 22;
  const perKm = 1.85;
  return Math.min(240, Math.round(base + km * perKm));
};

/** Airports sharing the same normalized city label (e.g. Istanbul IST vs SAW). */
export const airportsForTripCity = (city: string): Airport[] => {
  const c = city.trim().toLowerCase();
  if (!c) {
    return [];
  }
  return AIRPORTS.filter((a) => a.city.trim().toLowerCase() === c);
};

/**
 * For arrival: from `arrivalAirport` to first-segment city — if metro has multiple airports, report min/max minutes.
 */
export const arrivalAirportToCityRange = (arrivalAirport: Airport, segmentCity: string): { min: number; max: number; note: string } => {
  const metro = airportsForTripCity(segmentCity);
  if (metro.length === 0) {
    const fallback = 50;
    return {
      min: fallback,
      max: 90,
      note: `No hub match for "${segmentCity}" in bundled airport list — assume ~${fallback}–90 min curb-to-base until geocoded routing exists.`,
    };
  }
  const legs = metro.map((hub) => estimateSurfaceLegMinutes(arrivalAirport, hub));
  const min = Math.min(...legs);
  const max = Math.max(...legs);
  const multi = metro.length > 1;
  const note = multi
    ? `${segmentCity} has multiple commercial airports (${metro.map((m) => m.iataCode).join(", ")}). Surface time from ${arrivalAirport.iataCode} ranges ~${min}–${max} min depending on which airport is closest to the stay.`
    : `Surface time ${arrivalAirport.iataCode} → ${segmentCity} orbit ~${min} min (bundle estimate).`;
  return { min, max, note };
};

/** For departure: from base city to `departureAirport` (where the return flight leaves). */
export const cityToDepartureAirportRange = (segmentCity: string, departureAirport: Airport): { min: number; max: number; note: string } =>
  arrivalAirportToCityRange(departureAirport, segmentCity);

export const normalizeFlightNumber = (raw: string): string => raw.replace(/\s+/g, "").toUpperCase();

export const parseFlightIata = (raw: string): { airline: string; number: string } | null => {
  const s = normalizeFlightNumber(raw);
  const m = /^([A-Z]{2,3})(\d{1,4})$/.exec(s);
  if (!m) {
    return null;
  }
  return { airline: m[1]!, number: m[2]! };
};
