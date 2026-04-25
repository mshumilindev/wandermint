import { describe, expect, it } from "vitest";
import type { DayPlan } from "../../entities/day-plan/model";
import { normalizeItineraryCategory } from "../../services/planning/itineraryCompositionService";
import {
  accumulateDayPlanSignals,
  computeTravelTasteProfile,
  emptyTasteRawSignals,
  isTasteExplorationCategory,
  tasteTransitionCostDelta,
} from "./travelTasteCalculator";

const block = (overrides: Partial<import("../../entities/activity/model").ActivityBlock>): import("../../entities/activity/model").ActivityBlock => ({
  id: "b1",
  type: "activity",
  title: "Museum visit",
  description: "",
  startTime: "10:00",
  endTime: "11:00",
  category: "culture",
  tags: ["museum"],
  indoorOutdoor: "indoor",
  estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
  dependencies: {
    weatherSensitive: false,
    bookingRequired: false,
    openingHoursSensitive: false,
    priceSensitive: false,
  },
  alternatives: [],
  sourceSnapshots: [],
  priority: "should",
  locked: false,
  completionStatus: "pending",
  ...overrides,
});

describe("computeTravelTasteProfile", () => {
  it("keeps confidence low after a single trip worth of signals", () => {
    const raw = emptyTasteRawSignals();
    const day: DayPlan = {
      id: "d1",
      userId: "u1",
      tripId: "t1",
      segmentId: "s1",
      cityLabel: "Paris",
      date: "2026-01-10",
      theme: "",
      blocks: [block({ id: "a", completionStatus: "done" }), block({ id: "b", completionStatus: "skipped", title: "Walk", tags: ["walk"] })],
      estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
      validationStatus: "fresh",
      warnings: [],
      completionStatus: "done",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    accumulateDayPlanSignals([day], "t1", normalizeItineraryCategory, raw);
    const profile = computeTravelTasteProfile("u1", raw);
    expect(profile.confidence).toBeLessThan(0.55);
    expect(Object.keys(profile.categoryAffinity).length).toBeGreaterThan(0);
  });

  it("raises confidence only when multiple trips and enough events contribute", () => {
    const raw = emptyTasteRawSignals();
    const mkDay = (tripId: string, date: string): DayPlan => ({
      id: `d-${tripId}-${date}`,
      userId: "u1",
      tripId,
      segmentId: "s1",
      cityLabel: "X",
      date,
      theme: "",
      blocks: Array.from({ length: 6 }).map((_, i) =>
        block({
          id: `${tripId}-${i}`,
          title: `Stop ${i}`,
          category: i % 2 === 0 ? "food" : "museum",
          tags: i % 2 === 0 ? ["italian"] : ["art"],
          completionStatus: "done",
          place: i % 3 === 0 ? { provider: "t", name: "P", capturedAt: "", rating: 5 } : undefined,
        }),
      ),
      estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
      validationStatus: "fresh",
      warnings: [],
      completionStatus: "done",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    accumulateDayPlanSignals([mkDay("t1", "2026-02-01")], "t1", normalizeItineraryCategory, raw);
    accumulateDayPlanSignals([mkDay("t2", "2026-03-01")], "t2", normalizeItineraryCategory, raw);
    accumulateDayPlanSignals([mkDay("t3", "2026-04-01")], "t3", normalizeItineraryCategory, raw);
    const profile = computeTravelTasteProfile("u1", raw);
    expect(profile.confidence).toBeGreaterThan(0.35);
    expect(profile.favoritePatterns.length).toBeGreaterThan(0);
  });
});

describe("tasteTransitionCostDelta", () => {
  it("does not move costs when confidence is near zero", () => {
    const profile = computeTravelTasteProfile("u1", emptyTasteRawSignals());
    expect(tasteTransitionCostDelta("museum", profile)).toBe(0);
  });

  it("nudges preferred categories lower cost (negative delta)", () => {
    const raw = emptyTasteRawSignals();
    const day: DayPlan = {
      id: "d1",
      userId: "u1",
      tripId: "t1",
      segmentId: "s1",
      cityLabel: "Y",
      date: "2026-05-01",
      theme: "",
      blocks: Array.from({ length: 10 }).map((_, i) =>
        block({
          id: `x-${i}`,
          title: "Museum",
          category: "museum",
          tags: ["museum"],
          completionStatus: "done",
        }),
      ),
      estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
      validationStatus: "fresh",
      warnings: [],
      completionStatus: "done",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    accumulateDayPlanSignals([day], "t1", normalizeItineraryCategory, raw);
    accumulateDayPlanSignals(
      [
        {
          ...day,
          id: "d2",
          tripId: "t2",
          date: "2026-05-02",
          blocks: day.blocks.map((b, i) => ({ ...b, id: `y-${i}` })),
        },
      ],
      "t2",
      normalizeItineraryCategory,
      raw,
    );
    const profile = computeTravelTasteProfile("u1", raw);
    const delta = tasteTransitionCostDelta("museum", profile);
    expect(profile.confidence).toBeGreaterThanOrEqual(0.08);
    expect(delta).toBeLessThan(0);
  });
});

describe("isTasteExplorationCategory", () => {
  it("treats unknown categories as exploration when profile is null", () => {
    expect(isTasteExplorationCategory("novelty", null)).toBe(true);
  });
});
