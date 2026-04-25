import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import { analyzeCompletedTrip } from "./tripReviewCalculator";
import { buildTripReview } from "./tripReviewSummary";

const loc = (lat: number, lng: number): TripPlanItem["location"] => ({ lat, lng });

const item = (overrides: Partial<TripPlanItem> & Pick<TripPlanItem, "id" | "type" | "priority">): TripPlanItem => ({
  title: "Stop",
  plannedStartTime: "2025-06-01T10:00:00.000Z",
  plannedEndTime: "2025-06-01T11:00:00.000Z",
  estimatedDurationMinutes: 60,
  travelTimeFromPreviousMinutes: 0,
  status: "planned",
  location: loc(50, 14),
  ...overrides,
});

beforeAll(() => {
  process.env.TZ = "UTC";
});

afterAll(() => {
  delete process.env.TZ;
});

describe("buildTripReview", () => {
  it("computes completion and skip rates from planned items", () => {
    const trip = {
      tripId: "t1",
      userId: "u1",
      plannedItems: [
        item({ id: "a", type: "activity", priority: "high" }),
        item({ id: "b", type: "activity", priority: "medium" }),
        item({ id: "c", type: "activity", priority: "low" }),
      ],
      completedItemIds: ["a", "b"],
      skippedItemIds: ["c"],
    };
    const r = buildTripReview(trip);
    expect(r.completionRate).toBeCloseTo(2 / 3);
    expect(r.skipRate).toBeCloseTo(1 / 3);
  });

  it("treats ids in both completed and skipped as completed", () => {
    const trip = {
      tripId: "t1",
      userId: "u1",
      plannedItems: [item({ id: "x", type: "activity", priority: "must" })],
      completedItemIds: ["x"],
      skippedItemIds: ["x"],
    };
    const r = buildTripReview(trip);
    expect(r.completionRate).toBe(1);
    expect(r.skipRate).toBe(0);
  });

  it("flags days with more than 30% skips", () => {
    const trip = {
      tripId: "t1",
      userId: "u1",
      plannedItems: [
        item({ id: "1", type: "activity", priority: "low", plannedStartTime: "2025-06-01T09:00:00.000Z" }),
        item({ id: "2", type: "activity", priority: "low", plannedStartTime: "2025-06-01T10:00:00.000Z" }),
        item({ id: "3", type: "activity", priority: "low", plannedStartTime: "2025-06-01T11:00:00.000Z" }),
        item({ id: "4", type: "activity", priority: "low", plannedStartTime: "2025-06-01T12:00:00.000Z" }),
      ],
      completedItemIds: ["1"],
      skippedItemIds: ["2", "3", "4"],
    };
    const r = buildTripReview(trip);
    expect(r.overloadedDays).toContain("2025-06-01");
    expect(r.insights.some((i) => i.includes("2025-06-01") && i.includes("30%"))).toBe(true);
  });

  it("surfaces category contrast and delay patterns", () => {
    const trip = {
      tripId: "t1",
      userId: "u1",
      plannedItems: [
        item({
          id: "m1",
          type: "museum",
          priority: "high",
          plannedStartTime: "2025-06-02T09:00:00.000Z",
          plannedEndTime: "2025-06-02T10:00:00.000Z",
        }),
        item({
          id: "m2",
          type: "museum",
          priority: "high",
          plannedStartTime: "2025-06-02T10:30:00.000Z",
          plannedEndTime: "2025-06-02T11:30:00.000Z",
        }),
        item({
          id: "v1",
          type: "viewpoint",
          priority: "medium",
          plannedStartTime: "2025-06-02T12:00:00.000Z",
          plannedEndTime: "2025-06-02T12:45:00.000Z",
        }),
        item({
          id: "v2",
          type: "viewpoint",
          priority: "low",
          plannedStartTime: "2025-06-02T14:00:00.000Z",
          plannedEndTime: "2025-06-02T14:30:00.000Z",
        }),
      ],
      completedItemIds: ["m1", "m2"],
      skippedItemIds: ["v1", "v2"],
      actualStartTimes: {
        m1: "2025-06-02T09:05:00.000Z",
        m2: "2025-06-02T10:32:00.000Z",
      },
    };
    const r = buildTripReview(trip);
    expect(r.mostSkippedCategories.join(" ").toLowerCase()).toContain("viewpoint");
    expect(r.insights.some((i) => i.toLowerCase().includes("museum") && i.toLowerCase().includes("viewpoint"))).toBe(
      true,
    );
  });

  it("detects thin meal coverage on heavy activity days", () => {
    const long = 120;
    const trip = {
      tripId: "t1",
      userId: "u1",
      plannedItems: [
        item({
          id: "a1",
          type: "sightseeing",
          priority: "high",
          estimatedDurationMinutes: long,
          plannedStartTime: "2025-06-03T08:00:00.000Z",
          plannedEndTime: "2025-06-03T10:00:00.000Z",
        }),
        item({
          id: "a2",
          type: "sightseeing",
          priority: "high",
          estimatedDurationMinutes: long,
          plannedStartTime: "2025-06-03T10:30:00.000Z",
          plannedEndTime: "2025-06-03T12:30:00.000Z",
        }),
        item({
          id: "a3",
          type: "sightseeing",
          priority: "medium",
          estimatedDurationMinutes: long,
          plannedStartTime: "2025-06-03T13:00:00.000Z",
          plannedEndTime: "2025-06-03T15:00:00.000Z",
        }),
        item({
          id: "a4",
          type: "sightseeing",
          priority: "medium",
          estimatedDurationMinutes: long,
          plannedStartTime: "2025-06-03T15:30:00.000Z",
          plannedEndTime: "2025-06-03T17:30:00.000Z",
        }),
      ],
      completedItemIds: ["a1", "a2", "a3", "a4"],
      skippedItemIds: [],
    };
    const c = analyzeCompletedTrip(trip);
    expect(c.mealInsufficient).toBe(true);
    const r = buildTripReview(trip);
    expect(r.insights.some((i) => i.toLowerCase().includes("food") || i.toLowerCase().includes("meal"))).toBe(true);
  });

  it("averages start delays from actualStartTimes", () => {
    const trip = {
      tripId: "t1",
      userId: "u1",
      plannedItems: [
        item({
          id: "p1",
          type: "activity",
          priority: "must",
          plannedStartTime: "2025-06-04T08:00:00.000Z",
        }),
        item({
          id: "p2",
          type: "activity",
          priority: "must",
          plannedStartTime: "2025-06-04T09:00:00.000Z",
        }),
      ],
      completedItemIds: ["p1", "p2"],
      skippedItemIds: [],
      actualStartTimes: {
        p1: "2025-06-04T08:10:00.000Z",
        p2: "2025-06-04T09:30:00.000Z",
      },
    };
    const r = buildTripReview(trip);
    expect(r.averageDelayMinutes).toBeCloseTo(20);
  });
});
