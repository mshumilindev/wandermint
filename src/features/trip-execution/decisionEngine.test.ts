import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decide } from "./decisionEngine";
import type { TripPlanItem, TripExecutionState } from "./decisionEngine.types";
import { minutesBetweenUtc, totalRequiredMinutes, wallTimeOnSameLocalDayMs } from "./decisionEngine.utils";

const loc = (lat: number, lng: number, indoorOutdoor?: TripPlanItem["location"]["indoorOutdoor"]): TripPlanItem["location"] => ({
  lat,
  lng,
  ...(indoorOutdoor ? { indoorOutdoor } : {}),
});

const item = (overrides: Partial<TripPlanItem> & Pick<TripPlanItem, "id" | "title" | "priority">): TripPlanItem => ({
  type: "activity",
  location: loc(50, 14),
  plannedStartTime: "2025-01-15T10:00:00.000Z",
  plannedEndTime: "2025-01-15T11:00:00.000Z",
  estimatedDurationMinutes: 60,
  travelTimeFromPreviousMinutes: 0,
  status: "planned",
  ...overrides,
});

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("decisionEngine.utils", () => {
  it("computes minutes between wall times on local day", () => {
    const anchor = "2025-01-15T10:00:00.000Z";
    const end = wallTimeOnSameLocalDayMs(anchor, "22:00");
    const start = wallTimeOnSameLocalDayMs(anchor, "10:00");
    expect(minutesBetweenUtc(start, end)).toBe(12 * 60);
  });
});

describe("decide", () => {
  const baseState = (overrides: Partial<TripExecutionState>): TripExecutionState => ({
    now: "2025-01-15T10:00:00.000Z",
    dayStartTime: "08:00",
    dayEndTime: "22:00",
    items: [],
    completedItemIds: [],
    skippedItemIds: [],
    userMode: "balanced",
    ...overrides,
  });

  it("returns on_track and continue when the plan fits", () => {
    const items: TripPlanItem[] = [
      item({
        id: "a",
        title: "Museum",
        priority: "high",
        plannedStartTime: "2025-01-15T10:00:00.000Z",
        plannedEndTime: "2025-01-15T11:00:00.000Z",
        estimatedDurationMinutes: 60,
        travelTimeFromPreviousMinutes: 0,
      }),
      item({
        id: "b",
        title: "Lunch",
        priority: "medium",
        plannedStartTime: "2025-01-15T12:00:00.000Z",
        plannedEndTime: "2025-01-15T13:00:00.000Z",
        estimatedDurationMinutes: 60,
        travelTimeFromPreviousMinutes: 15,
      }),
    ];
    const state = baseState({ items });
    const result = decide(state);
    expect(result.status).toBe("on_track");
    expect(result.recommendedAction).toBe("continue");
    expect(result.removedItems).toHaveLength(0);
    expect(result.nextItem?.id).toBe("a");
    expect(totalRequiredMinutes(items)).toBe(60 + 15 + 60);
  });

  it("drops lowest priority items until feasible (overloaded)", () => {
    const items: TripPlanItem[] = [
      item({
        id: "must",
        title: "Flight check-in",
        priority: "must",
        plannedStartTime: "2025-01-15T18:00:00.000Z",
        plannedEndTime: "2025-01-15T18:30:00.000Z",
        estimatedDurationMinutes: 30,
        travelTimeFromPreviousMinutes: 0,
      }),
      item({
        id: "low",
        title: "Gift shop",
        priority: "low",
        plannedStartTime: "2025-01-15T19:00:00.000Z",
        plannedEndTime: "2025-01-15T19:45:00.000Z",
        estimatedDurationMinutes: 45,
        travelTimeFromPreviousMinutes: 10,
      }),
      item({
        id: "med",
        title: "Neighbourhood walk",
        priority: "medium",
        plannedStartTime: "2025-01-15T20:00:00.000Z",
        plannedEndTime: "2025-01-15T21:30:00.000Z",
        estimatedDurationMinutes: 90,
        travelTimeFromPreviousMinutes: 10,
      }),
    ];
    const state = baseState({
      now: "2025-01-15T19:30:00.000Z",
      items,
    });
    const remainingMinutes = 30 + 10 + 45 + 10 + 90;
    const available = minutesBetweenUtc(
      new Date("2025-01-15T19:30:00.000Z").getTime(),
      wallTimeOnSameLocalDayMs("2025-01-15T19:30:00.000Z", "22:00"),
    );
    expect(available).toBeLessThan(remainingMinutes);

    const result = decide(state);
    expect(result.status).toBe("overloaded");
    expect(result.recommendedAction).toBe("skip_next_low_priority");
    expect(result.removedItems.map((r) => r.id)).toContain("low");
    expect(result.removedItems.some((r) => r.id === "must")).toBe(false);
    expect(result.nextItem?.id).toBe("must");
  });

  it("returns needs_replan when only must items cannot fit", () => {
    const items: TripPlanItem[] = [
      item({
        id: "m1",
        title: "Mandatory dinner",
        priority: "must",
        plannedStartTime: "2025-01-15T20:00:00.000Z",
        plannedEndTime: "2025-01-15T23:00:00.000Z",
        estimatedDurationMinutes: 180,
        travelTimeFromPreviousMinutes: 0,
      }),
    ];
    const state = baseState({
      now: "2025-01-15T21:00:00.000Z",
      items,
    });
    const result = decide(state);
    expect(result.status).toBe("needs_replan");
    expect(result.recommendedAction).toBe("reorder_remaining");
    expect(result.removedItems).toHaveLength(0);
  });

  it("applies 25% reduction to available time when energy is low", () => {
    const items: TripPlanItem[] = [
      item({
        id: "x",
        title: "Long block",
        priority: "medium",
        plannedStartTime: "2025-01-15T13:56:00.000Z",
        plannedEndTime: "2025-01-15T20:00:00.000Z",
        estimatedDurationMinutes: 400,
        travelTimeFromPreviousMinutes: 0,
      }),
    ];
    const withoutEnergy = decide(
      baseState({
        now: "2025-01-15T14:00:00.000Z",
        items,
        energyLevel: "high",
      }),
    );
    const withEnergy = decide(
      baseState({
        now: "2025-01-15T14:00:00.000Z",
        items,
        energyLevel: "low",
      }),
    );
    expect(withoutEnergy.status).toBe("on_track");
    expect(withEnergy.removedItems.length).toBeGreaterThan(0);
    expect(withEnergy.status).toBe("overloaded");
  });

  it("treats an empty remaining plan as finished for the day", () => {
    const result = decide(baseState({ items: [] }));
    expect(result.status).toBe("on_track");
    expect(result.recommendedAction).toBe("end_day");
    expect(result.removedItems).toHaveLength(0);
    expect(result.nextItem).toBeUndefined();
  });

  it("ignores must items that are already skipped when sizing remaining work", () => {
    const mustItem = item({
      id: "must1",
      title: "Mandatory ticket",
      priority: "must",
      plannedStartTime: "2025-01-15T18:00:00.000Z",
      plannedEndTime: "2025-01-15T18:30:00.000Z",
      estimatedDurationMinutes: 30,
      travelTimeFromPreviousMinutes: 0,
    });
    const flex = item({
      id: "flex",
      title: "Optional stroll",
      priority: "low",
      plannedStartTime: "2025-01-15T19:00:00.000Z",
      plannedEndTime: "2025-01-15T19:45:00.000Z",
      estimatedDurationMinutes: 45,
      travelTimeFromPreviousMinutes: 10,
    });
    const state = baseState({
      now: "2025-01-15T19:00:00.000Z",
      items: [mustItem, flex],
      skippedItemIds: ["must1"],
    });
    const result = decide(state);
    expect(result.nextItem?.id).toBe("flex");
    expect(result.removedItems.some((r) => r.id === "must1")).toBe(false);
  });

  it("under high weather risk removes outdoor low-priority before indoor low-priority", () => {
    const items: TripPlanItem[] = [
      item({
        id: "in",
        title: "Cafe indoor",
        priority: "low",
        location: loc(50, 14, "indoor"),
        plannedStartTime: "2025-01-15T14:00:00.000Z",
        plannedEndTime: "2025-01-15T14:40:00.000Z",
        estimatedDurationMinutes: 40,
        travelTimeFromPreviousMinutes: 0,
      }),
      item({
        id: "out",
        title: "Park",
        priority: "low",
        location: loc(50.1, 14.1, "outdoor"),
        plannedStartTime: "2025-01-15T15:00:00.000Z",
        plannedEndTime: "2025-01-15T15:40:00.000Z",
        estimatedDurationMinutes: 40,
        travelTimeFromPreviousMinutes: 10,
      }),
    ];
    const state = baseState({
      now: "2025-01-15T21:20:00.000Z",
      weatherRisk: "high",
      items,
    });
    const result = decide(state);
    expect(result.removedItems[0]?.id).toBe("out");
    expect(result.removedItems.some((r) => r.id === "in")).toBe(false);
    expect(result.reorderedItems.length).toBeGreaterThan(0);
  });
});
