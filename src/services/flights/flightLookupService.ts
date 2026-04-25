import { z } from "zod";
import type { Airport } from "./flightTypes";
import type { AirportInfo, FlightLookupResult, FlightSegment, LayoverAnalysis, LayoverFeasibility, LayoverMiniPlan } from "./flightTypes";
import { getAirportByIata } from "./airportCatalog";
import { normalizeFlightNumber, parseFlightIata } from "./flightGeo";
import { createClientId } from "../../shared/lib/id";

const aviationRowSchema = z.object({
  flight_date: z.string().optional(),
  airline: z.object({ name: z.string().optional() }).optional(),
  flight: z.object({ iata: z.string().optional(), number: z.string().optional(), status: z.string().optional() }).optional(),
  departure: z
    .object({
      iata: z.string().optional(),
      scheduled: z.string().optional(),
      actual: z.string().optional(),
      airport: z.string().optional(),
      timezone: z.string().optional(),
      terminal: z.string().optional(),
    })
    .optional(),
  arrival: z
    .object({
      iata: z.string().optional(),
      scheduled: z.string().optional(),
      actual: z.string().optional(),
      airport: z.string().optional(),
      timezone: z.string().optional(),
      terminal: z.string().optional(),
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
 * Falls back to `provider_unavailable`/`not_found`/`partial` instead of throwing into UI.
 */
export const lookupFlightByNumber = async (params: {
  flightNumber: string;
  /** YYYY-MM-DD */
  date?: string;
  signal?: AbortSignal;
}): Promise<FlightLookupResult> => {
  const key = import.meta.env.VITE_AVIATIONSTACK_ACCESS_KEY?.trim();
  const fn = normalizeFlightNumber(params.flightNumber);
  const parsed = parseFlightIata(fn);
  if (!parsed) {
    return {
      status: "not_found",
      sourceProvider: "unavailable",
      flightNumber: fn,
      segments: [],
      warnings: ["Flight number format is invalid. Use values like LO281 or BA 847."],
    };
  }
  if (!key) {
    return {
      status: "provider_unavailable",
      sourceProvider: "unavailable",
      flightNumber: fn,
      segments: [],
      warnings: ["Flight lookup provider is not configured. You can add manual flight segments."],
    };
  }

  const url = new URL("http://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", key);
  url.searchParams.set("flight_iata", fn);
  if (params.date?.trim()) {
    url.searchParams.set("flight_date", params.date.trim());
  }

  try {
    const response = await fetch(url.toString(), { signal: params.signal });
    if (!response.ok) {
      return {
        status: "provider_unavailable",
        sourceProvider: "aviationstack",
        flightNumber: fn,
        segments: [],
        warnings: [`Flight provider returned HTTP ${response.status}.`],
      };
    }
    const body: unknown = await response.json();
    const parsedRes = aviationResponseSchema.safeParse(body);
    if (!parsedRes.success) {
      return {
        status: "partial",
        sourceProvider: "aviationstack",
        flightNumber: fn,
        segments: [],
        warnings: ["Flight provider returned unexpected shape, route details may be incomplete."],
      };
    }
    const rows = parsedRes.data.data ?? [];
    if (rows.length === 0) {
      return {
        status: "not_found",
        sourceProvider: "aviationstack",
        flightNumber: fn,
        segments: [],
        warnings: ["No flights found for this number/date."],
      };
    }
    const segments: FlightSegment[] = [];
    const warnings: string[] = ["Scheduled data can change; verify departure board near travel date."];
    for (const row of rows.slice(0, 4)) {
      if (!row.departure?.iata || !row.arrival?.iata) {
        continue;
      }
      const depCatalog = airportFromAviationIata(row.departure.iata);
      const arrCatalog = airportFromAviationIata(row.arrival.iata);
      const depAirport: AirportInfo = {
        code: row.departure.iata.trim().toUpperCase(),
        name: row.departure.airport ?? depCatalog?.name,
        city: depCatalog?.city,
        country: depCatalog?.country,
        timezone: row.departure.timezone ?? undefined,
        coordinates: depCatalog?.coordinates,
      };
      const arrAirport: AirportInfo = {
        code: row.arrival.iata.trim().toUpperCase(),
        name: row.arrival.airport ?? arrCatalog?.name,
        city: arrCatalog?.city,
        country: arrCatalog?.country,
        timezone: row.arrival.timezone ?? undefined,
        coordinates: arrCatalog?.coordinates,
      };
      const scheduledDepartureTime = row.departure.scheduled?.trim();
      const scheduledArrivalTime = row.arrival.scheduled?.trim();
      segments.push({
        id: createClientId("fltseg"),
        flightNumber: normalizeFlightNumber(row.flight?.iata ?? fn),
        airline: row.airline?.name?.trim() || undefined,
        departureAirport: depAirport,
        arrivalAirport: arrAirport,
        scheduledDepartureTime,
        scheduledArrivalTime,
        actualDepartureTime: row.departure.actual?.trim() || undefined,
        actualArrivalTime: row.arrival.actual?.trim() || undefined,
        departureTerminal: row.departure.terminal?.trim() || undefined,
        arrivalTerminal: row.arrival.terminal?.trim() || undefined,
        status: mapProviderStatus(row.flight?.status),
        dataConfidence: scheduledDepartureTime && scheduledArrivalTime ? "high" : "medium",
        sourceProvider: "aviationstack",
        departureTime: scheduledDepartureTime,
        arrivalTime: scheduledArrivalTime,
      });
    }
    if (segments.length === 0) {
      return {
        status: "partial",
        sourceProvider: "aviationstack",
        flightNumber: fn,
        segments: [],
        warnings: ["Provider returned rows but key route fields are missing."],
      };
    }
    const allScheduled = segments.every((s) => Boolean(s.scheduledDepartureTime && s.scheduledArrivalTime));
    return {
      status: allScheduled ? "found" : "partial",
      sourceProvider: "aviationstack",
      flightNumber: fn,
      segments,
      warnings,
    };
  } catch {
    return {
      status: "provider_unavailable",
      sourceProvider: "aviationstack",
      flightNumber: fn,
      segments: [],
      warnings: ["Flight provider request failed."],
    };
  }
};

const mapProviderStatus = (value: string | undefined): FlightSegment["status"] => {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return "unknown";
  }
  if (raw.includes("sched")) {
    return "scheduled";
  }
  if (raw.includes("active") || raw.includes("en route")) {
    return "active";
  }
  if (raw.includes("land")) {
    return "landed";
  }
  if (raw.includes("delay")) {
    return "delayed";
  }
  if (raw.includes("cancel")) {
    return "cancelled";
  }
  return "unknown";
};

export const extractFlightNumbers = (input: string): string[] => {
  const tokens = input.toUpperCase().match(/\b[A-Z0-9]{2,3}\s?\d{1,4}\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const normalized = normalizeFlightNumber(token);
    if (!parseFlightIata(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};

export const lookupItineraryByFlightNumbers = async (params: {
  input: string;
  date?: string;
  signal?: AbortSignal;
}): Promise<{ numbers: string[]; results: FlightLookupResult[]; segments: FlightSegment[]; warnings: string[] }> => {
  const numbers = extractFlightNumbers(params.input);
  const results: FlightLookupResult[] = [];
  for (const number of numbers) {
    // Keep sequence deterministic and provider-throttle friendly.
    // eslint-disable-next-line no-await-in-loop
    const result = await lookupFlightByNumber({ flightNumber: number, date: params.date, signal: params.signal });
    results.push(result);
  }
  const flattened = results.flatMap((result) => result.segments.map((segment) => ({ ...segment, flightNumber: numberOrSelf(segment, result.flightNumber) })));
  const sortable = flattened.every((segment) => Boolean(segment.scheduledDepartureTime));
  const segments = sortable
    ? [...flattened].sort((left, right) => (left.scheduledDepartureTime ?? "").localeCompare(right.scheduledDepartureTime ?? ""))
    : flattened;
  return {
    numbers,
    results,
    segments,
    warnings: results.flatMap((item) => item.warnings),
  };
};

const numberOrSelf = (segment: FlightSegment, fallback: string): string => segment.flightNumber.trim() || fallback;

export const buildManualFlightSegment = (params: {
  flightNumber: string;
  departureAirport: Airport;
  arrivalAirport: Airport;
  departureTime: string;
  arrivalTime: string;
}): FlightSegment => ({
  id: createClientId("fltseg"),
  flightNumber: normalizeFlightNumber(params.flightNumber),
  departureAirport: {
    code: params.departureAirport.iataCode,
    name: params.departureAirport.name,
    city: params.departureAirport.city,
    country: params.departureAirport.country,
    coordinates: params.departureAirport.coordinates,
  },
  arrivalAirport: {
    code: params.arrivalAirport.iataCode,
    name: params.arrivalAirport.name,
    city: params.arrivalAirport.city,
    country: params.arrivalAirport.country,
    coordinates: params.arrivalAirport.coordinates,
  },
  scheduledDepartureTime: params.departureTime,
  scheduledArrivalTime: params.arrivalTime,
  status: "scheduled",
  dataConfidence: "low",
  sourceProvider: "manual",
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

export const estimateAirportCityTransferMinutes = (airport: AirportInfo): number => {
  if (!airport.coordinates) {
    return 45;
  }
  return 45;
};

const getSegmentDeparture = (segment: FlightSegment): string | undefined => segment.scheduledDepartureTime ?? segment.departureTime;
const getSegmentArrival = (segment: FlightSegment): string | undefined => segment.scheduledArrivalTime ?? segment.arrivalTime;

export const detectLayovers = (segments: FlightSegment[]): LayoverAnalysis[] => {
  const ordered = [...segments].sort((left, right) => {
    const l = getSegmentDeparture(left);
    const r = getSegmentDeparture(right);
    if (l && r) {
      return l.localeCompare(r);
    }
    return 0;
  });
  const layovers: LayoverAnalysis[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const previous = ordered[index]!;
    const next = ordered[index + 1]!;
    const sameAirport = previous.arrivalAirport.code === next.departureAirport.code;
    const sameCityDifferentAirport = Boolean(
      !sameAirport &&
      previous.arrivalAirport.city &&
      next.departureAirport.city &&
      previous.arrivalAirport.city.trim().toLowerCase() === next.departureAirport.city.trim().toLowerCase(),
    );
    if (!sameAirport && !sameCityDifferentAirport) {
      continue;
    }
    const arrival = getSegmentArrival(previous);
    const departure = getSegmentDeparture(next);
    const durationMinutes = arrival && departure ? Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / 60000) : undefined;
    const warnings: string[] = [];
    const estimatedAirportExitMinutes = 60;
    const estimatedReturnBufferMinutes = 120;
    const estimatedCityTransferMinutes = sameAirport ? estimateAirportCityTransferMinutes(previous.arrivalAirport) : 60;
    const usableFreeTimeMinutes =
      durationMinutes === undefined ? undefined : durationMinutes - estimatedAirportExitMinutes - estimatedReturnBufferMinutes - estimatedCityTransferMinutes * 2;
    const feasibility = classifyLayoverFeasibility(durationMinutes, usableFreeTimeMinutes, sameCityDifferentAirport);
    if (durationMinutes !== undefined && durationMinutes < 0) {
      warnings.push("Segment timing order is inconsistent; verify schedule/date.");
    }
    if (sameCityDifferentAirport) {
      warnings.push("Connection requires airport change in same city; risk is high without long buffer.");
    }
    const suggestedMiniPlan = buildLayoverMiniPlan(feasibility, previous.arrivalAirport, usableFreeTimeMinutes);
    const confidence: LayoverAnalysis["confidence"] =
      durationMinutes === undefined ? "low" : sameCityDifferentAirport ? "medium" : "high";
    layovers.push({
      id: createClientId("layover"),
      airport: sameAirport ? previous.arrivalAirport : next.departureAirport,
      previousFlight: previous,
      nextFlight: next,
      arrivalTime: arrival,
      departureTime: departure,
      durationMinutes,
      feasibility,
      estimatedAirportExitMinutes,
      estimatedReturnBufferMinutes,
      estimatedCityTransferMinutes,
      usableFreeTimeMinutes,
      confidence,
      recommendationTitle: recommendationTitle(feasibility),
      recommendationDescription: recommendationDescription(feasibility, usableFreeTimeMinutes),
      suggestedMiniPlan,
      warnings,
    });
  }
  return layovers;
};

const classifyLayoverFeasibility = (
  durationMinutes: number | undefined,
  usableFreeTimeMinutes: number | undefined,
  airportTransferConnection: boolean,
): LayoverFeasibility => {
  if (airportTransferConnection) {
    return "airport_transfer_connection";
  }
  if (durationMinutes === undefined || Number.isNaN(durationMinutes)) {
    return "unknown";
  }
  if (durationMinutes < 90) {
    return "airport_only";
  }
  if (durationMinutes < 180) {
    return "short_airport_walk";
  }
  if (durationMinutes < 300) {
    return "near_airport";
  }
  if (durationMinutes < 480) {
    return (usableFreeTimeMinutes ?? -1) >= 90 ? "city_walk_possible" : "near_airport";
  }
  return (usableFreeTimeMinutes ?? -1) >= 180 ? "city_visit_recommended" : "near_airport";
};

const recommendationTitle = (feasibility: LayoverFeasibility): string => {
  switch (feasibility) {
    case "airport_only":
      return "Airport-only connection";
    case "short_airport_walk":
      return "Stay inside airport";
    case "near_airport":
      return "Near-airport time window";
    case "city_walk_possible":
      return "Short city walk possible";
    case "city_visit_recommended":
      return "City visit window available";
    case "airport_transfer_connection":
      return "Airport transfer risk";
    default:
      return "Needs more details";
  }
};

const recommendationDescription = (feasibility: LayoverFeasibility, usableFreeTimeMinutes?: number): string => {
  if (feasibility === "unknown") {
    return "Missing schedule details. Keep plan inside airport until timings are confirmed.";
  }
  if (feasibility === "airport_transfer_connection") {
    return "Prioritize transfer logistics and buffer first; treat city activities as unsafe unless timing is very long.";
  }
  const usable = usableFreeTimeMinutes !== undefined ? ` Usable free time: ~${Math.max(0, usableFreeTimeMinutes)} min.` : "";
  switch (feasibility) {
    case "airport_only":
      return `Too short to leave airside. Use gate-adjacent options only.${usable}`;
    case "short_airport_walk":
      return `Use terminal food/coffee/lounge options and stay close to departure gate.${usable}`;
    case "near_airport":
      return `If needed, keep activities near airport perimeter and avoid city-center detours.${usable}`;
    case "city_walk_possible":
      return `Compact city stop is possible if transfers remain predictable.${usable}`;
    case "city_visit_recommended":
      return `Long layover allows a compact city mini-route with conservative return buffer.${usable}`;
    default:
      return usable;
  }
};

const buildLayoverMiniPlan = (
  feasibility: LayoverFeasibility,
  airport: AirportInfo,
  usableFreeTimeMinutes: number | undefined,
): LayoverMiniPlan | undefined => {
  const total = Math.max(0, usableFreeTimeMinutes ?? 0);
  if (feasibility === "airport_only" || feasibility === "short_airport_walk" || feasibility === "unknown") {
    return {
      title: "Terminal-safe mini plan",
      durationMinutes: Math.min(90, total || 90),
      items: [
        { title: "Coffee + hydration", type: "airport_terminal", estimatedMinutes: 25 },
        { title: "Meal near gate", type: "food", estimatedMinutes: 35 },
        { title: "Gate return buffer", type: "airport_lounge", estimatedMinutes: 30 },
      ],
      safetyNotes: ["Do not leave airport perimeter.", "Re-check gate and terminal updates before boarding."],
    };
  }
  if (feasibility === "near_airport") {
    return {
      title: "Near-airport low-risk break",
      city: airport.city,
      durationMinutes: Math.min(120, total || 120),
      items: [
        { title: "Cafe outside terminal", type: "near_airport", estimatedMinutes: 35 },
        { title: "Short neighborhood walk", type: "walk", estimatedMinutes: 35 },
        { title: "Return to terminal early", type: "airport_terminal", estimatedMinutes: 40 },
      ],
      safetyNotes: ["Stay close to airport transit line.", "Skip if queues or immigration wait times are high."],
    };
  }
  if (feasibility === "city_walk_possible") {
    return {
      title: "Compact city walk",
      city: airport.city,
      durationMinutes: Math.min(180, total || 180),
      items: [
        { title: "Transit to central stop", type: "walk", estimatedMinutes: 35 },
        { title: "Quick viewpoint + coffee", type: "viewpoint", estimatedMinutes: 55 },
        { title: "Return transfer", type: "walk", estimatedMinutes: 45 },
      ],
      safetyNotes: ["Keep plan to one compact area.", "Start return leg no later than 2 hours before departure."],
    };
  }
  if (feasibility === "city_visit_recommended") {
    return {
      title: "Layover city sampler",
      city: airport.city,
      durationMinutes: Math.min(240, total || 240),
      items: [
        { title: "Local brunch or lunch", type: "food", estimatedMinutes: 60 },
        { title: "Core district walk", type: "walk", estimatedMinutes: 70 },
        { title: "Single indoor stop", type: "museum", estimatedMinutes: 60 },
        { title: "Return to airport", type: "near_airport", estimatedMinutes: 50 },
      ],
      safetyNotes: ["Use compact route only.", "Keep passport/security timeline conservative."],
    };
  }
  return undefined;
};

/** Backward compatibility for old field consumers. */
export const resolveFlightByNumber = async (params: {
  flightNumber: string;
  flightDate: string;
  signal?: AbortSignal;
}): Promise<FlightSegment | null> => {
  const lookup = await lookupFlightByNumber({ flightNumber: params.flightNumber, date: params.flightDate, signal: params.signal });
  return lookup.segments[0] ?? null;
};
