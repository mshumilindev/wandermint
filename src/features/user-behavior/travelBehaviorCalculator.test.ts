import { describe, expect, it } from "vitest";
import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import {
  applyTravelBehaviorToTripDraft,
  buildCompletedTripSummaryFromDayPlans,
  calculateTravelBehaviorProfile,
  mapTripPreferencesPaceToSelectedPace,
} from "./travelBehaviorCalculator";
import type { CompletedTripSummary, TravelBehaviorProfile } from "./travelBehavior.types";

const baseTrip = (overrides: Partial<Trip> = {}): Trip =>
  ({
    id: "t1",
    userId: "u1",
    title: "Test",
    destination: "X",
    tripSegments: [],
    dateRange: { start: "2025-01-01", end: "2025-01-03" },
    flightInfo: {},
    hotelInfo: {},
    budget: { amount: 1000, currency: "EUR", style: "balanced" },
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
    status: "completed",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    lastValidatedAt: null,
    planVersion: 1,
    executionProfile: {
      explorationSpeed: "standard",
      scheduleDensity: "balanced",
      attractionDwellStyle: "standard",
      walkingTempo: "standard",
      transferTolerance: "medium",
      recoveryNeed: "medium",
      eventCentricity: "medium",
      priorityMode: "balanced",
    },
    ...overrides,
  }) as Trip;

const blockDefaults: ActivityBlock = {
  id: "b1",
  type: "activity",
  title: "Museum",
  description: "",
  startTime: "10:00",
  endTime: "11:00",
  category: "museum",
  tags: [],
  indoorOutdoor: "indoor",
  estimatedCost: { min: 0, max: 10, currency: "EUR", certainty: "estimated" },
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
};

const block = (overrides: Partial<ActivityBlock> & Pick<ActivityBlock, "id" | "completionStatus">): ActivityBlock => ({
  ...blockDefaults,
  ...overrides,
});

const dayPlan = (overrides: Partial<DayPlan>): DayPlan => ({
  id: "d1",
  userId: "u1",
  tripId: "t1",
  segmentId: "s1",
  cityLabel: "Berlin",
  date: "2025-01-02",
  theme: "Day",
  blocks: [],
  estimatedCostRange: { min: 0, max: 50, currency: "EUR", certainty: "estimated" },
  validationStatus: "fresh",
  warnings: [],
  completionStatus: "done",
  updatedAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

describe("mapTripPreferencesPaceToSelectedPace", () => {
  it("maps dense to fast", () => {
    expect(mapTripPreferencesPaceToSelectedPace("dense")).toBe("fast");
  });
});

describe("buildCompletedTripSummaryFromDayPlans", () => {
  it("returns zero counts when there are no day plans", () => {
    const summary = buildCompletedTripSummaryFromDayPlans([], baseTrip());
    expect(summary.plannedItemsCount).toBe(0);
    expect(summary.completedItemsCount).toBe(0);
    expect(summary.skippedItemsCount).toBe(0);
  });

  it("counts blocks and skips cancelled replan", () => {
    const days: DayPlan[] = [
      dayPlan({
        blocks: [
          block({ id: "a", completionStatus: "done" }),
          block({ id: "b", completionStatus: "skipped" }),
          block({ id: "c", completionStatus: "cancelled_by_replan" }),
        ],
      }),
    ];
    const summary = buildCompletedTripSummaryFromDayPlans(days, baseTrip());
    expect(summary.plannedItemsCount).toBe(2);
    expect(summary.completedItemsCount).toBe(1);
    expect(summary.skippedItemsCount).toBe(1);
    expect(summary.selectedPace).toBe("balanced");
  });

  it("reflects a skip-heavy day as mostly skipped completions", () => {
    const blocks = Array.from({ length: 8 }, (_, i) =>
      block({
        id: `s${i}`,
        completionStatus: i < 2 ? "done" : "skipped",
      }),
    );
    const days: DayPlan[] = [dayPlan({ blocks })];
    const summary = buildCompletedTripSummaryFromDayPlans(days, baseTrip());
    expect(summary.plannedItemsCount).toBe(8);
    expect(summary.skippedItemsCount).toBe(6);
    expect(summary.completedItemsCount).toBe(2);
    expect(summary.skippedItemsCount / summary.plannedItemsCount).toBeGreaterThan(0.5);
  });

  it("counts a skipped must-have anchor like any other skipped block", () => {
    const days: DayPlan[] = [
      dayPlan({
        blocks: [block({ id: "must", priority: "must", completionStatus: "skipped" })],
      }),
    ];
    const summary = buildCompletedTripSummaryFromDayPlans(days, baseTrip());
    expect(summary.plannedItemsCount).toBe(1);
    expect(summary.skippedItemsCount).toBe(1);
    expect(summary.completedItemsCount).toBe(0);
  });

  it("nudges delay from day adjustment and skip pressure", () => {
    const days: DayPlan[] = [
      dayPlan({
        adjustment: { state: "early_finish", updatedAt: "2025-01-01T00:00:00.000Z" },
        blocks: [block({ id: "a", completionStatus: "done" })],
      }),
    ];
    const summary = buildCompletedTripSummaryFromDayPlans(days, baseTrip());
    expect(summary.averageDelayMinutes).toBeLessThan(0);
  });
});

describe("calculateTravelBehaviorProfile", () => {
  it("returns null when no planned items", () => {
    expect(calculateTravelBehaviorProfile(null, { ...emptySummary(), plannedItemsCount: 0 }, "u1")).toBeNull();
  });

  it("marks overplanned when aggregate skip rate is high", () => {
    const trip1: CompletedTripSummary = {
      plannedItemsCount: 10,
      completedItemsCount: 5,
      skippedItemsCount: 5,
      averageDelayMinutes: 0,
      selectedPace: "balanced",
    };
    const first = calculateTravelBehaviorProfile(null, trip1, "u1");
    expect(first?.planningBias).toBe("overplanned");
    expect(first?.averageSkipRate).toBe(0.5);
  });

  it("merges trips and prefers underplanned when consistently early with high completion", () => {
    const easy: CompletedTripSummary = {
      plannedItemsCount: 20,
      completedItemsCount: 20,
      skippedItemsCount: 0,
      averageDelayMinutes: -15,
      selectedPace: "slow",
    };
    const p1 = calculateTravelBehaviorProfile(null, easy, "u1");
    expect(p1?.averageCompletionRate).toBe(1);
    const p2 = calculateTravelBehaviorProfile(p1, easy, "u1");
    expect(p2?.totalTrips).toBe(2);
    expect(p2?.planningBias).toBe("underplanned");
  });
});

describe("applyTravelBehaviorToTripDraft", () => {
  it("relaxes schedule when profile says overplanned", () => {
    const profile: TravelBehaviorProfile = {
      userId: "u1",
      totalTrips: 2,
      totalPlannedItems: 10,
      totalCompletedItems: 5,
      totalSkippedItems: 5,
      averageCompletionRate: 0.5,
      averageSkipRate: 0.5,
      averageDelayMinutes: 5,
      preferredPace: "balanced",
      planningBias: "overplanned",
      lastUpdatedAt: "2025-01-01T00:00:00.000Z",
    };
    const draft = {
      executionProfile: baseTrip().executionProfile!,
    };
    const next = applyTravelBehaviorToTripDraft(draft, profile);
    expect(next.executionProfile.scheduleDensity).toBe("relaxed");
    expect(["slow", "standard"]).toContain(next.executionProfile.explorationSpeed);
  });
});

const emptySummary = (): CompletedTripSummary => ({
  plannedItemsCount: 0,
  completedItemsCount: 0,
  skippedItemsCount: 0,
  averageDelayMinutes: 0,
  selectedPace: "balanced",
});
