import dayjs from "dayjs";
import type { FlightSegment } from "./flightTypes";
import { arrivalAirportToCityRange, cityToDepartureAirportRange } from "./flightGeo";

const ARRIVAL_BUFFER_MIN = 75;
const DEPARTURE_BUFFER_MIN = 120;

export type FlightPlanningDraftSlice = {
  tripSegments: { city: string; country: string }[];
  inboundFlight?: FlightSegment;
  outboundFlight?: FlightSegment;
};

const formatIsoHint = (iso: string): string => {
  const d = dayjs(iso);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : iso;
};

const firstSegment = (draft: FlightPlanningDraftSlice): { city: string; country: string } => {
  const seg = draft.tripSegments[0];
  return { city: seg?.city?.trim() ?? "", country: seg?.country?.trim() ?? "" };
};

const lastSegment = (draft: FlightPlanningDraftSlice): { city: string; country: string } => {
  const seg = draft.tripSegments[draft.tripSegments.length - 1];
  return { city: seg?.city?.trim() ?? "", country: seg?.country?.trim() ?? "" };
};

const buildInboundClause = (draft: FlightPlanningDraftSlice, inbound: FlightSegment): string[] => {
  const { city } = firstSegment(draft);
  const arrAirport = toLegacyAirport(inbound.arrivalAirport);
  const depAirport = toLegacyAirport(inbound.departureAirport);
  if (!arrAirport || !depAirport) {
    return [];
  }
  const range = city ? arrivalAirportToCityRange(arrAirport, city) : { min: 45, max: 75, note: "Allow surface transfer from arrival airport to base." };
  const arrivalTime = inbound.scheduledArrivalTime ?? inbound.arrivalTime ?? "";
  const departureTime = inbound.scheduledDepartureTime ?? inbound.departureTime ?? "";
  const arrivalEnd = dayjs(arrivalTime).add(ARRIVAL_BUFFER_MIN, "minute");
  return [
    `INBOUND FLIGHT ${inbound.flightNumber}: dep ${depAirport.iataCode} (${depAirport.name}) ${formatIsoHint(departureTime)} → arr ${arrAirport.iataCode} (${arrAirport.name}) ${formatIsoHint(arrivalTime)}.`,
    `Arrival-day rule: do not schedule deep activities before ~${formatIsoHint(arrivalEnd.toISOString())} (arrival + ${ARRIVAL_BUFFER_MIN}m buffer for baggage + curb).`,
    `Airport→base surface band: ~${range.min}–${range.max} min — ${range.note}`,
    "Reduce first-day density after this window; route first stops toward the stay from the arrival airport vector.",
  ];
};

const buildOutboundClause = (draft: FlightPlanningDraftSlice, outbound: FlightSegment): string[] => {
  const { city } = lastSegment(draft);
  const depAirport = toLegacyAirport(outbound.departureAirport);
  const arrAirport = toLegacyAirport(outbound.arrivalAirport);
  if (!arrAirport || !depAirport) {
    return [];
  }
  const range = city ? cityToDepartureAirportRange(city, depAirport) : { min: 45, max: 75, note: "Allow travel to departure airport." };
  const departureTime = outbound.scheduledDepartureTime ?? outbound.departureTime ?? "";
  const arrivalTime = outbound.scheduledArrivalTime ?? outbound.arrivalTime ?? "";
  const leaveBy = dayjs(departureTime).subtract(DEPARTURE_BUFFER_MIN + range.max, "minute");
  return [
    `OUTBOUND (RETURN) FLIGHT ${outbound.flightNumber}: dep ${depAirport.iataCode} (${depAirport.name}) ${formatIsoHint(departureTime)} → arr ${arrAirport.iataCode} (${arrAirport.name}) ${formatIsoHint(arrivalTime)}.`,
    `Departure-day rule: end distant / high-friction activities so the traveler can reach ${depAirport.iataCode} with ~${DEPARTURE_BUFFER_MIN}m airport buffer after a ~${range.max}m worst-case surface leg — target finishing heavy plans before ~${formatIsoHint(leaveBy.toISOString())}.`,
    `Base→airport surface band: ~${range.min}–${range.max} min — ${range.note}`,
    "Last day: no far-field excursions after mid-day unless timing still clears the buffers above.",
  ];
};

const toLegacyAirport = (airport: FlightSegment["departureAirport"]):
  | { iataCode: string; name: string; city: string; country: string; coordinates: { lat: number; lng: number } }
  | null => {
  if (!airport.code || !airport.name || !airport.city || !airport.country || !airport.coordinates) {
    return null;
  }
  return {
    iataCode: airport.code,
    name: airport.name,
    city: airport.city,
    country: airport.country,
    coordinates: airport.coordinates,
  };
};

export const buildFlightPlanningClause = (draft: FlightPlanningDraftSlice): string => {
  const lines: string[] = [];
  if (draft.inboundFlight) {
    lines.push(...buildInboundClause(draft, draft.inboundFlight));
  }
  if (draft.outboundFlight) {
    lines.push(...buildOutboundClause(draft, draft.outboundFlight));
  }
  if (lines.length === 0) {
    return "";
  }
  return [
    "FLIGHT-AWARE HARD CONSTRAINTS (use real airports below; never invent flights or move these times):",
    ...lines,
    "IST vs SAW (and similar multi-airport metros): treat airport choice as disjunctive logistics — different pins imply materially different transfer times.",
  ].join("\n");
};
