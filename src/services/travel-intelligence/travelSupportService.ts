import type { TravelExecutionProfile, TravelSupportPlan, TripSegment } from "../../entities/trip/model";
import { createClientId } from "../../shared/lib/id";

export const travelSupportService = {
  createSupportPlan: (segments: TripSegment[], executionProfile: TravelExecutionProfile, hasAnchorEvents: boolean): TravelSupportPlan => {
    const isDense = executionProfile.scheduleDensity === "dense" || executionProfile.scheduleDensity === "extreme";
    const isMultiCity = segments.length > 1;
    return {
      timezones: segments.map((segment) => ({ segmentId: segment.id })),
      jetLag: {
        arrivalFatigue: isDense ? "high" : "medium",
        guidance: [
          isDense ? "Keep the first arrival block flexible so the trip can absorb fatigue without losing locked plans." : "Protect one soft landing window after arrival.",
          hasAnchorEvents ? "Keep event tickets and venue arrival buffers visible as locked obligations." : "Keep evening plans adjustable until arrival energy is known.",
        ],
      },
      preDepartureChecklist: [
        { id: createClientId("check"), label: "Passport or government ID", category: "documents", done: false },
        { id: createClientId("check"), label: "Hotel confirmations", category: "documents", done: false },
        ...(hasAnchorEvents ? [{ id: createClientId("check"), label: "Event tickets saved offline", category: "tickets" as const, done: false }] : []),
        ...(isMultiCity ? [{ id: createClientId("check"), label: "Intercity transport buffers reviewed", category: "transport" as const, done: false }] : []),
      ],
      clothingReminders: ["Check segment forecasts before packing final outerwear.", "Plan one adaptable layer for late-night temperature drops."],
      railPassConsideration: isMultiCity
        ? {
            worthConsidering: true,
            rationale: "This route has multiple city changes; compare a rail pass against point-to-point fares before booking.",
            confidence: "medium",
          }
        : undefined,
    };
  },
};
