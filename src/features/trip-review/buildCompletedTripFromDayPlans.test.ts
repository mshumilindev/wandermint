import { describe, expect, it } from "vitest";
import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import { buildCompletedTripForTripReviewFromDayPlans } from "./buildCompletedTripFromDayPlans";

const baseDeps = (): ActivityBlock["dependencies"] => ({
  weatherSensitive: false,
  bookingRequired: false,
  openingHoursSensitive: false,
  priceSensitive: false,
});

const block = (overrides: Partial<ActivityBlock> & Pick<ActivityBlock, "id">): ActivityBlock => ({
  id: overrides.id,
  type: overrides.type ?? "activity",
  title: overrides.title ?? "Stop",
  description: "",
  startTime: overrides.startTime ?? "10:00",
  endTime: overrides.endTime ?? "11:00",
  category: overrides.category ?? "sightseeing",
  tags: [],
  indoorOutdoor: "indoor",
  estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
  dependencies: baseDeps(),
  alternatives: [],
  sourceSnapshots: [],
  priority: "should",
  locked: false,
  completionStatus: overrides.completionStatus ?? "done",
  place: overrides.place,
});

const trip = (): Trip =>
  ({
    id: "trip1",
    userId: "u1",
    title: "T",
    destination: "X",
    dateRange: { start: "2026-06-01", end: "2026-06-02" },
    status: "active",
    tripSegments: [{ id: "seg", city: "Berlin", country: "Germany", startDate: "2026-06-01", endDate: "2026-06-02", hotelInfo: {} }],
    preferences: {
      partyComposition: "solo",
      vibe: [],
      foodInterests: [],
      walkingTolerance: "medium",
      pace: "balanced",
      avoids: [],
      mustSeeNotes: "",
      specialWishes: "",
    },
    executionProfile: {
      explorationSpeed: "standard",
      scheduleDensity: "balanced",
      attractionDwellStyle: "standard",
      walkingTempo: "standard",
      transferTolerance: "medium",
      recoveryNeed: "medium",
      eventCentricity: "low",
      priorityMode: "balanced",
    },
    budget: { amount: 1000, currency: "EUR", style: "balanced" },
    flightInfo: {},
    hotelInfo: {},
    intercityMoves: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastValidatedAt: null,
    planVersion: 1,
  }) as unknown as Trip;

describe("buildCompletedTripForTripReviewFromDayPlans", () => {
  it("zeros coordinates on planned items for stored review payloads", () => {
    const b = block({
      id: "a1",
      place: {
        provider: "t",
        name: "Museum",
        city: "Berlin",
        country: "DE",
        latitude: 52.52,
        longitude: 13.405,
        capturedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const day: DayPlan = {
      id: "d1",
      userId: "u1",
      tripId: "trip1",
      segmentId: "seg",
      cityLabel: "Berlin",
      countryLabel: "Germany",
      date: "2026-06-01",
      theme: "",
      blocks: [b],
      movementLegs: [],
      estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
      validationStatus: "fresh",
      warnings: [],
      completionStatus: "done",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const c = buildCompletedTripForTripReviewFromDayPlans([day], trip());
    expect(c).not.toBeNull();
    expect(c!.plannedItems[0]?.location.lat).toBe(0);
    expect(c!.plannedItems[0]?.location.lng).toBe(0);
  });
});
