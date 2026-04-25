import { describe, expect, it } from "vitest";
import { dayWindowMinutes, sumDefaultBufferMinutes } from "./timelineCalculator";
import type { DayPlan } from "../../../entities/day-plan/model";
import { dayPlanToTripDayTimeline, validateTripDayTimeline } from "./timelineValidator";
import type { TripDayTimeline, TripPlanItem } from "./timeline.types";

const item = (overrides: Partial<TripPlanItem> & Pick<TripPlanItem, "id">): TripPlanItem => ({
  title: "Stop",
  type: "activity",
  estimatedDurationMinutes: 60,
  travelTimeFromPreviousMinutes: 0,
  plannedStartTime: "09:00",
  plannedEndTime: "10:00",
  ...overrides,
});

describe("validateTripDayTimeline", () => {
  it("treats an empty item list as feasible with no overload", () => {
    const timeline: TripDayTimeline = {
      date: "2025-06-01",
      startTime: "09:00",
      endTime: "12:00",
      items: [],
    };
    const result = validateTripDayTimeline(timeline);
    expect(result.isFeasible).toBe(true);
    expect(result.overloadMinutes).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("flags non-finite travel time from the previous stop", () => {
    const timeline: TripDayTimeline = {
      date: "2025-06-01",
      startTime: "09:00",
      endTime: "18:00",
      items: [
        item({ id: "a", travelTimeFromPreviousMinutes: 0, plannedStartTime: "09:00", plannedEndTime: "10:00", estimatedDurationMinutes: 60 }),
        item({
          id: "b",
          travelTimeFromPreviousMinutes: Number.NaN,
          travelDistanceHint: "medium",
          plannedStartTime: "10:30",
          plannedEndTime: "11:30",
          estimatedDurationMinutes: 60,
        }),
      ],
    };
    const result = validateTripDayTimeline(timeline);
    expect(result.isFeasible).toBe(false);
    expect(result.warnings.some((w) => w.type === "travel_time_missing")).toBe(true);
  });

  it("warns when travel is zero but the move is not marked nearby", () => {
    const timeline: TripDayTimeline = {
      date: "2025-06-01",
      startTime: "09:00",
      endTime: "18:00",
      items: [
        item({ id: "a", travelTimeFromPreviousMinutes: 0, plannedStartTime: "09:00", plannedEndTime: "10:00", estimatedDurationMinutes: 60 }),
        item({
          id: "b",
          travelTimeFromPreviousMinutes: 0,
          travelDistanceHint: "medium",
          plannedStartTime: "10:30",
          plannedEndTime: "11:30",
          estimatedDurationMinutes: 60,
        }),
      ],
    };
    const result = validateTripDayTimeline(timeline);
    expect(result.warnings.some((w) => w.type === "travel_time_missing")).toBe(true);
  });

  it("marks feasible for a light day within the window", () => {
    const timeline: TripDayTimeline = {
      date: "2025-06-01",
      startTime: "09:00",
      endTime: "18:00",
      items: [
        item({ id: "a", travelTimeFromPreviousMinutes: 0, plannedStartTime: "09:00", plannedEndTime: "10:00", estimatedDurationMinutes: 60 }),
        item({
          id: "b",
          travelTimeFromPreviousMinutes: 15,
          travelDistanceHint: "nearby",
          plannedStartTime: "10:25",
          plannedEndTime: "11:25",
          estimatedDurationMinutes: 60,
        }),
      ],
    };
    const result = validateTripDayTimeline(timeline);
    expect(result.overloadMinutes).toBe(0);
    expect(result.isFeasible).toBe(true);
  });

  it("marks infeasible when active hours exceed 10", () => {
    const items: TripPlanItem[] = Array.from({ length: 11 }, (_, i) =>
      item({
        id: `b${i}`,
        title: `Block ${i}`,
        estimatedDurationMinutes: 60,
        travelTimeFromPreviousMinutes: i === 0 ? 0 : 5,
        travelDistanceHint: i === 0 ? undefined : "medium",
        plannedStartTime: "09:00",
        plannedEndTime: "10:00",
      }),
    );
    const timeline: TripDayTimeline = {
      date: "2025-06-01",
      startTime: "08:00",
      endTime: "22:00",
      items,
    };
    const result = validateTripDayTimeline(timeline);
    expect(result.isFeasible).toBe(false);
    expect(result.warnings.some((w) => w.type === "day_too_long")).toBe(true);
  });

  it("detects insufficient clock gap vs travel plus buffer", () => {
    const timeline: TripDayTimeline = {
      date: "2025-06-01",
      startTime: "09:00",
      endTime: "12:00",
      items: [
        item({ id: "a", travelTimeFromPreviousMinutes: 0, plannedStartTime: "09:00", plannedEndTime: "10:00", estimatedDurationMinutes: 60 }),
        item({
          id: "b",
          travelTimeFromPreviousMinutes: 30,
          travelDistanceHint: "medium",
          plannedStartTime: "10:05",
          plannedEndTime: "11:00",
          estimatedDurationMinutes: 55,
        }),
      ],
    };
    const result = validateTripDayTimeline(timeline);
    expect(result.isFeasible).toBe(false);
    expect(result.warnings.some((w) => w.type === "not_enough_buffer")).toBe(true);
  });
});

describe("dayPlanToTripDayTimeline", () => {
  it("produces an empty timeline for a day with no blocks", () => {
    const day: DayPlan = {
      id: "d0",
      userId: "u",
      tripId: "t",
      segmentId: "s",
      cityLabel: "X",
      date: "2025-06-01",
      theme: "Empty",
      blocks: [],
      movementLegs: [],
      estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
      validationStatus: "fresh",
      warnings: [],
      completionStatus: "pending",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const timeline = dayPlanToTripDayTimeline(day);
    expect(timeline.items).toHaveLength(0);
    const result = validateTripDayTimeline(timeline);
    expect(result.isFeasible).toBe(true);
  });

  it("maps movement leg duration onto travelTimeFromPreviousMinutes", () => {
    const day: DayPlan = {
      id: "d1",
      userId: "u",
      tripId: "t",
      segmentId: "s",
      cityLabel: "X",
      date: "2025-06-01",
      theme: "Day",
      blocks: [
        {
          id: "b1",
          type: "activity" as const,
          title: "A",
          description: "",
          startTime: "09:00",
          endTime: "10:00",
          category: "museum",
          tags: [],
          indoorOutdoor: "indoor" as const,
          estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" as const },
          dependencies: { weatherSensitive: false, bookingRequired: false, openingHoursSensitive: false, priceSensitive: false },
          alternatives: [],
          sourceSnapshots: [],
          priority: "should" as const,
          locked: false,
          completionStatus: "pending" as const,
        },
        {
          id: "b2",
          type: "activity" as const,
          title: "B",
          description: "",
          startTime: "10:30",
          endTime: "11:30",
          category: "walk",
          tags: [],
          indoorOutdoor: "outdoor" as const,
          estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" as const },
          dependencies: { weatherSensitive: false, bookingRequired: false, openingHoursSensitive: false, priceSensitive: false },
          alternatives: [],
          sourceSnapshots: [],
          priority: "optional" as const,
          locked: false,
          completionStatus: "pending" as const,
        },
      ],
      movementLegs: [
        {
          id: "m1",
          fromBlockId: "b1",
          toBlockId: "b2",
          summary: "",
          primary: { mode: "walking" as const, durationMinutes: 18, certainty: "live" as const, sourceName: "t" },
          alternatives: [],
        },
      ],
      estimatedCostRange: { min: 0, max: 1, currency: "EUR", certainty: "unknown" as const },
      validationStatus: "fresh" as const,
      warnings: [],
      completionStatus: "pending" as const,
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const timeline = dayPlanToTripDayTimeline(day);
    expect(timeline.items[1]?.travelTimeFromPreviousMinutes).toBe(18);
  });
});

describe("timelineCalculator", () => {
  it("sums default buffers between items", () => {
    const items: TripPlanItem[] = [
      item({ id: "a", travelTimeFromPreviousMinutes: 0, travelDistanceHint: undefined }),
      item({ id: "b", travelTimeFromPreviousMinutes: 10, travelDistanceHint: "nearby" }),
      item({ id: "c", travelTimeFromPreviousMinutes: 20, travelDistanceHint: "medium" }),
    ];
    expect(sumDefaultBufferMinutes(items)).toBe(10 + 20);
    expect(dayWindowMinutes("09:00", "18:00")).toBe(9 * 60);
  });
});
