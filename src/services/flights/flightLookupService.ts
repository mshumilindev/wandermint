import { z } from "zod";
import type { Airport } from "./flightTypes";
import type { FlightSegment } from "./flightTypes";
import { getAirportByIata } from "./airportCatalog";
import { normalizeFlightNumber, parseFlightIata } from "./flightGeo";

const aviationRowSchema = z.object({
  flight_date: z.string().optional(),
  departure: z
    .object({
      iata: z.string().optional(),
      scheduled: z.string().optional(),
      airport: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  arrival: z
    .object({
      iata: z.string().optional(),
      scheduled: z.string().optional(),
      airport: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
});

const aviationResponseSchema = z.object({
  data: z.array(aviationRowSchema).optional(),
});

const airportFromAviationIata = (iata: string | undefined): Airport | null => {
  if (!iata?.trim()) {
    return null;
  }
  return getAirportByIata(iata) ?? null;
};

/**
 * Resolve a commercial segment via Aviationstack when `VITE_AVIATIONSTACK_ACCESS_KEY` is set.
 * Falls back to `null` so the UI can guide manual airport selection.
 */
export const resolveFlightByNumber = async (params: {
  flightNumber: string;
  /** YYYY-MM-DD — required by Aviationstack for scheduled rows */
  flightDate: string;
  signal?: AbortSignal;
}): Promise<FlightSegment | null> => {
  const key = import.meta.env.VITE_AVIATIONSTACK_ACCESS_KEY?.trim();
  const fn = normalizeFlightNumber(params.flightNumber);
  const parsed = parseFlightIata(fn);
  if (!key || !parsed || !params.flightDate.trim()) {
    return null;
  }

  const url = new URL("http://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", key);
  url.searchParams.set("flight_iata", fn);
  url.searchParams.set("flight_date", params.flightDate.trim());

  try {
    const response = await fetch(url.toString(), { signal: params.signal });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    const parsedRes = aviationResponseSchema.safeParse(body);
    if (!parsedRes.success) {
      return null;
    }
    const row = parsedRes.data.data?.[0];
    if (!row?.departure?.iata || !row.arrival?.iata) {
      return null;
    }
    const depAp = airportFromAviationIata(row.departure.iata);
    const arrAp = airportFromAviationIata(row.arrival.iata);
    const depTime = row.departure.scheduled?.trim();
    const arrTime = row.arrival.scheduled?.trim();
    if (!depAp || !arrAp || !depTime || !arrTime) {
      return null;
    }
    return {
      flightNumber: fn,
      departureAirport: depAp,
      arrivalAirport: arrAp,
      departureTime: depTime,
      arrivalTime: arrTime,
    };
  } catch {
    return null;
  }
};

export const buildManualFlightSegment = (params: {
  flightNumber: string;
  departureAirport: Airport;
  arrivalAirport: Airport;
  departureTime: string;
  arrivalTime: string;
}): FlightSegment => ({
  flightNumber: normalizeFlightNumber(params.flightNumber),
  departureAirport: params.departureAirport,
  arrivalAirport: params.arrivalAirport,
  departureTime: params.departureTime,
  arrivalTime: params.arrivalTime,
});

export const tryBuildSegmentFromIataTimes = (params: {
  flightNumber: string;
  depIata: string;
  arrIata: string;
  departureTime: string;
  arrivalTime: string;
}): FlightSegment | null => {
  const dep = getAirportByIata(params.depIata);
  const arr = getAirportByIata(params.arrIata);
  if (!dep || !arr) {
    return null;
  }
  return buildManualFlightSegment({
    flightNumber: params.flightNumber,
    departureAirport: dep,
    arrivalAirport: arr,
    departureTime: params.departureTime,
    arrivalTime: params.arrivalTime,
  });
};
