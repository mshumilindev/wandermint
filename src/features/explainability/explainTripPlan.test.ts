import { describe, expect, it } from "vitest";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import type { GeneratedTripOptions } from "../../services/ai/schemas";
import type { TripDraft } from "../../services/planning/tripGenerationService";
import { explainTripPlan } from "./explainTripPlan";

const minimalTrip = (overrides: Partial<Trip> = {}): Trip =>
  ({
    id: "trip-1",
    userId: "u1",
    title: "Test",
    destination: "Lisbon",
    tripSegments: [
      {
        id: "seg1",
        city: "Lisbon",
        country: "PT",
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        hotelInfo: {},
      },
    ],
    dateRange: { start: "2026-06-01", end: "2026-06-03" },
    flightInfo: {},
    hotelInfo: {},
    budget: { amount: 1200, currency: "EUR", style: "balanced" },
    preferences: {
      partyComposition: "couple",
      vibe: ["culture"],
      foodInterests: ["seafood"],
      walkingTolerance: "medium",
      pace: "balanced",
      avoids: ["casino"],
      mustSeeNotes: "miradouro",
      specialWishes: "",
    },
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastValidatedAt: null,
    planVersion: 1,
    ...overrides,
  }) as Trip;

const minimalDay = (blocks: DayPlan["blocks"]): DayPlan => ({
  id: "day-1",
  userId: "u1",
  tripId: "trip-1",
  segmentId: "seg1",
  cityLabel: "Lisbon",
  date: "2026-06-01",
  theme: "Day",
  blocks,
  movementLegs: [],
  estimatedCostRange: { min: 0, max: 200, currency: "EUR", certainty: "estimated" },
  validationStatus: "fresh",
  warnings: [],
  completionStatus: "pending",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("explainTripPlan", () => {
  it("mentions concrete stops, must-see tokens, and avoids with no matching stops", () => {
    const draft = {
      userId: "u1",
      planningMode: "city_first" as const,
      destination: "Lisbon",
      tripSegments: minimalTrip().tripSegments,
      dateRange: minimalTrip().dateRange,
      flightInfo: {},
      hotelInfo: {},
      budget: minimalTrip().budget,
      preferences: minimalTrip().preferences,
      executionProfile: {
        explorationSpeed: "standard" as const,
        scheduleDensity: "balanced" as const,
        attractionDwellStyle: "standard" as const,
        walkingTempo: "standard" as const,
        transferTolerance: "medium" as const,
        recoveryNeed: "medium" as const,
        eventCentricity: "medium" as const,
        priorityMode: "balanced" as const,
      },
      anchorEvents: [],
    } as TripDraft;

    const blocks: DayPlan["blocks"] = [
      {
        id: "b1",
        type: "activity" as const,
        title: "Miradouro view",
        description: "",
        startTime: "09:00",
        endTime: "10:00",
        category: "landmark",
        tags: [],
        indoorOutdoor: "outdoor" as const,
        estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" as const },
        dependencies: { weatherSensitive: false, bookingRequired: false, openingHoursSensitive: false, priceSensitive: false },
        alternatives: [],
        sourceSnapshots: [],
        priority: "should" as const,
        locked: false,
        completionStatus: "pending" as const,
        place: {
          provider: "t",
          name: "Miradouro",
          latitude: 38.72,
          longitude: -9.13,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ];

    const option: GeneratedTripOptions["options"][number] = {
      optionId: "opt-1",
      label: "Option A",
      positioning: "Coastal viewpoints first.",
      trip: minimalTrip(),
      days: [minimalDay(blocks)],
      tradeoffs: [],
    };

    const explanation = explainTripPlan({ option, draft, feasibilityWarnings: [] });
    expect(explanation.summary).toContain("Option A");
    expect(explanation.summary).toContain("EUR");
    expect(explanation.includedBecause.some((l) => l.toLowerCase().includes("miradouro"))).toBe(true);
    expect(explanation.excludedBecause.some((l) => l.includes("casino"))).toBe(true);
    expect(explanation.lowConfidenceFields.some((l) => l.includes("cost"))).toBe(true);
  });
});
