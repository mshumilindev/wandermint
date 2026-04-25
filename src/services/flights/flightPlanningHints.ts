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
  const range = city ? arrivalAirportToCityRange(inbound.arrivalAirport, city) : { min: 45, max: 75, note: "Allow surface transfer from arrival airport to base." };
  const arrivalEnd = dayjs(inbound.arrivalTime).add(ARRIVAL_BUFFER_MIN, "minute");
  return [
    `INBOUND FLIGHT ${inbound.flightNumber}: dep ${inbound.departureAirport.iataCode} (${inbound.departureAirport.name}) ${formatIsoHint(inbound.departureTime)} → arr ${inbound.arrivalAirport.iataCode} (${inbound.arrivalAirport.name}) ${formatIsoHint(inbound.arrivalTime)}.`,
    `Arrival-day rule: do not schedule deep activities before ~${formatIsoHint(arrivalEnd.toISOString())} (arrival + ${ARRIVAL_BUFFER_MIN}m buffer for baggage + curb).`,
    `Airport→base surface band: ~${range.min}–${range.max} min — ${range.note}`,
    "Reduce first-day density after this window; route first stops toward the stay from the arrival airport vector.",
  ];
};

const buildOutboundClause = (draft: FlightPlanningDraftSlice, outbound: FlightSegment): string[] => {
  const { city } = lastSegment(draft);
  const range = city ? cityToDepartureAirportRange(city, outbound.departureAirport) : { min: 45, max: 75, note: "Allow travel to departure airport." };
  const leaveBy = dayjs(outbound.departureTime).subtract(DEPARTURE_BUFFER_MIN + range.max, "minute");
  return [
    `OUTBOUND (RETURN) FLIGHT ${outbound.flightNumber}: dep ${outbound.departureAirport.iataCode} (${outbound.departureAirport.name}) ${formatIsoHint(outbound.departureTime)} → arr ${outbound.arrivalAirport.iataCode} (${outbound.arrivalAirport.name}) ${formatIsoHint(outbound.arrivalTime)}.`,
    `Departure-day rule: end distant / high-friction activities so the traveler can reach ${outbound.departureAirport.iataCode} with ~${DEPARTURE_BUFFER_MIN}m airport buffer after a ~${range.max}m worst-case surface leg — target finishing heavy plans before ~${formatIsoHint(leaveBy.toISOString())}.`,
    `Base→airport surface band: ~${range.min}–${range.max} min — ${range.note}`,
    "Last day: no far-field excursions after mid-day unless timing still clears the buffers above.",
  ];
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
