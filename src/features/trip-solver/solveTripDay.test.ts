import { describe, expect, it } from "vitest";

import { resolveOpeningHoursFromLabel } from "../places/opening-hours/openingHoursResolver";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import { solveTripDay } from "./solveTripDay";

const item = (overrides: Partial<TripPlanItem>): TripPlanItem => ({
  id: "x",
  title: "Stop",
  type: "activity",
  priority: "medium",
  location: { lat: 48.8566, lng: 2.3522 },
  plannedStartTime: "2025-06-02T07:00:00.000Z",
  plannedEndTime: "2025-06-02T08:00:00.000Z",
  estimatedDurationMinutes: 60,
  travelTimeFromPreviousMinutes: 0,
  status: "planned",
  ...overrides,
});

describe("solveTripDay", () => {
  it("schedules must-do before lower priority when both fit", () => {
    const low = item({
      id: "low-first",
      title: "Low",
      priority: "low",
      location: { lat: 48.8566, lng: 2.3522 },
    });
    const must = item({
      id: "must-second",
      title: "Must",
      priority: "must",
      location: { lat: 48.857, lng: 2.353 },
    });
    const result = solveTripDay({
      candidates: [low, must],
      dayDate: "2025-06-02",
      dayStartTime: "09:00",
      dayEndTime: "18:00",
      timezone: "UTC",
    });
    expect(result.items.length).toBe(2);
    expect(result.items[0]?.id).toBe("must-second");
    expect(result.items[1]?.id).toBe("low-first");
    expect(result.feasibilityScore).toBeGreaterThan(0);
    expect(result.infeasibilityReasons).toEqual([]);
  });

  it("rejects items that are closed for the assigned window", () => {
    const closedVenue = item({
      id: "closed",
      title: "Museum",
      priority: "high",
      estimatedDurationMinutes: 60,
      location: { lat: 48.86, lng: 2.35 },
    });
    const hours = resolveOpeningHoursFromLabel("Mo 13:00-17:00", "UTC");
    expect(hours).not.toBeNull();
    const openVenue = item({
      id: "open",
      title: "Park",
      priority: "medium",
      estimatedDurationMinutes: 60,
      location: { lat: 48.861, lng: 2.351 },
    });
    const result = solveTripDay({
      candidates: [closedVenue, openVenue],
      dayDate: "2025-06-02",
      dayStartTime: "09:00",
      dayEndTime: "18:00",
      timezone: "UTC",
      openingHoursByItemId: { closed: hours! },
    });
    expect(result.rejectedItems.some((r) => r.item.id === "closed")).toBe(true);
    expect(result.items.some((i) => i.id === "open")).toBe(true);
  });

  it("rejects activities that would end after day end", () => {
    const long = item({
      id: "long",
      title: "All day",
      priority: "must",
      estimatedDurationMinutes: 600,
    });
    const result = solveTripDay({
      candidates: [long],
      dayDate: "2025-06-02",
      dayStartTime: "09:00",
      dayEndTime: "12:00",
      timezone: "UTC",
    });
    expect(result.items).toHaveLength(0);
    expect(result.rejectedItems).toHaveLength(1);
    expect(result.feasibilityScore).toBe(0);
    expect(result.infeasibilityReasons.length).toBeGreaterThan(0);
  });

  it("inserts a meal block into a gap and exposes missed requirements when impossible", () => {
    const a = item({
      id: "a",
      title: "Morning",
      priority: "high",
      estimatedDurationMinutes: 60,
      location: { lat: 48.85, lng: 2.35 },
    });
    const b = item({
      id: "b",
      title: "Afternoon",
      priority: "high",
      estimatedDurationMinutes: 60,
      location: { lat: 48.851, lng: 2.351 },
    });
    const result = solveTripDay({
      candidates: [b, a],
      dayDate: "2025-06-02",
      dayStartTime: "09:00",
      dayEndTime: "18:00",
      timezone: "UTC",
      mealRestRequirements: [
        {
          id: "lunch",
          kind: "meal",
          earliestStartWallMinutes: 11 * 60,
          latestStartWallMinutes: 13 * 60,
          durationMinutes: 30,
          label: "Lunch",
        },
      ],
    });
    const lunch = result.items.find((i) => i.id === "solver-lunch");
    expect(lunch).toBeDefined();
    expect(result.infeasibilityReasons).toEqual([]);

    const tight = solveTripDay({
      candidates: [
        item({
          id: "only",
          title: "Packed",
          priority: "must",
          estimatedDurationMinutes: 60,
          location: { lat: 40, lng: -74 },
        }),
      ],
      dayDate: "2025-06-02",
      dayStartTime: "09:00",
      dayEndTime: "10:00",
      timezone: "UTC",
      mealRestRequirements: [
        {
          id: "lunch2",
          kind: "meal",
          earliestStartWallMinutes: 0,
          latestStartWallMinutes: 8 * 60,
          durationMinutes: 120,
          label: "Long lunch",
        },
      ],
    });
    expect(tight.items.some((i) => i.id === "solver-lunch2")).toBe(false);
    expect(tight.infeasibilityReasons.some((r) => r.includes("lunch2"))).toBe(true);
  });

  it("enforces daily budget when spend estimates are provided", () => {
    const cheap = item({ id: "c1", title: "Cheap", priority: "medium", estimatedDurationMinutes: 30 });
    const pricey = item({
      id: "c2",
      title: "Pricey",
      priority: "medium",
      estimatedDurationMinutes: 30,
      location: { lat: 48.852, lng: 2.352 },
    });
    const result = solveTripDay({
      candidates: [pricey, cheap],
      dayDate: "2025-06-02",
      dayStartTime: "09:00",
      dayEndTime: "18:00",
      timezone: "UTC",
      budgetDailyMaxCents: 150,
      baselineSpendCents: 0,
      estimatedSpendCentsByItemId: { c1: 60, c2: 100 },
    });
    expect(result.items.map((i) => i.id).sort()).toEqual(["c1"]);
    expect(result.rejectedItems.some((r) => r.item.id === "c2")).toBe(true);
  });
});
