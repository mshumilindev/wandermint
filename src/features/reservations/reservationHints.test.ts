import { describe, expect, it } from "vitest";
import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import {
  collectReservationSameDayRoutingHints,
  getReservationRequirementForBlock,
  getReservationGuidanceLine,
} from "./reservationHints";

const blockShell = (overrides: Partial<ActivityBlock>): ActivityBlock =>
  ({
    id: "b1",
    type: "activity",
    title: "Walk",
    description: "",
    startTime: "09:00",
    endTime: "10:00",
    category: "walk",
    tags: [],
    indoorOutdoor: "outdoor",
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
  }) as ActivityBlock;

describe("getReservationRequirementForBlock", () => {
  it("flags major ticketed landmarks", () => {
    const r = getReservationRequirementForBlock(
      blockShell({ title: "Visit the Louvre", category: "museum" }),
    );
    expect(r.requirement).toBe("time_slot_required");
    expect(r.bookingUrl).toBeUndefined();
  });

  it("returns unknown for generic museums", () => {
    const r = getReservationRequirementForBlock(blockShell({ title: "City museum", category: "museum" }));
    expect(r.requirement).toBe("unknown");
    expect(getReservationGuidanceLine(r)).toContain("Check ticket");
  });
});

describe("collectReservationSameDayRoutingHints", () => {
  it("warns when two heavy-reservation stops share a day", () => {
    const day: DayPlan = {
      id: "d1",
      userId: "u",
      tripId: "t",
      segmentId: "s",
      date: "2026-07-01",
      cityLabel: "Paris",
      countryLabel: "FR",
      theme: "",
      blocks: [
        blockShell({ id: "a", title: "Louvre highlights", category: "museum" }),
        blockShell({ id: "b", title: "Eiffel tower deck", category: "attraction" }),
      ],
      movementLegs: [],
      estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
      validationStatus: "fresh",
      warnings: [],
      completionStatus: "pending",
      updatedAt: new Date().toISOString(),
    };
    const hints = collectReservationSameDayRoutingHints(day);
    expect(hints.length).toBe(1);
    expect(hints[0]).toContain("2026-07-01");
  });
});
