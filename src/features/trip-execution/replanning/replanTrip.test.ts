import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TripExecutionState, TripPlanItem } from "../decisionEngine.types";
import { replanTrip } from "./replanTrip";

const loc = (lat: number, lng: number): TripPlanItem["location"] => ({ lat, lng });

const planItem = (overrides: Partial<TripPlanItem> & Pick<TripPlanItem, "id" | "priority">): TripPlanItem => ({
  title: "Stop",
  type: "activity",
  plannedStartTime: "2025-06-01T10:00:00.000Z",
  plannedEndTime: "2025-06-01T11:00:00.000Z",
  estimatedDurationMinutes: 60,
  travelTimeFromPreviousMinutes: 0,
  status: "planned",
  location: loc(50, 14),
  ...overrides,
});

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("replanTrip", () => {
  it("preserves completed and skipped items", async () => {
    const state: TripExecutionState = {
      now: "2025-06-01T12:00:00.000Z",
      dayStartTime: "08:00",
      dayEndTime: "22:00",
      completedItemIds: ["done"],
      skippedItemIds: ["skip"],
      userMode: "balanced",
      items: [
        planItem({
          id: "done",
          priority: "must",
          status: "completed",
          plannedStartTime: "2025-06-01T08:00:00.000Z",
          plannedEndTime: "2025-06-01T09:00:00.000Z",
          travelTimeFromPreviousMinutes: 0,
        }),
        planItem({
          id: "skip",
          priority: "low",
          status: "skipped",
          plannedStartTime: "2025-06-01T09:30:00.000Z",
          plannedEndTime: "2025-06-01T10:00:00.000Z",
          travelTimeFromPreviousMinutes: 10,
        }),
        planItem({
          id: "a",
          priority: "must",
          plannedStartTime: "2025-06-01T10:00:00.000Z",
          plannedEndTime: "2025-06-01T11:00:00.000Z",
          travelTimeFromPreviousMinutes: 15,
        }),
      ],
    };
    const result = await replanTrip({ executionState: state, reason: "user_is_late" });
    expect(result.updatedItems.find((i) => i.id === "done")).toBeDefined();
    expect(result.updatedItems.find((i) => i.id === "skip")).toBeDefined();
  });

  it("removes lower priority first when overloaded", async () => {
    const state: TripExecutionState = {
      now: "2025-06-01T18:00:00.000Z",
      dayStartTime: "08:00",
      dayEndTime: "22:00",
      completedItemIds: [],
      skippedItemIds: [],
      userMode: "balanced",
      items: [
        planItem({
          id: "must1",
          priority: "must",
          plannedStartTime: "2025-06-01T18:00:00.000Z",
          plannedEndTime: "2025-06-01T19:00:00.000Z",
          estimatedDurationMinutes: 120,
          travelTimeFromPreviousMinutes: 0,
        }),
        planItem({
          id: "low1",
          priority: "low",
          type: "activity",
          plannedStartTime: "2025-06-01T19:30:00.000Z",
          plannedEndTime: "2025-06-01T20:30:00.000Z",
          estimatedDurationMinutes: 120,
          travelTimeFromPreviousMinutes: 30,
        }),
        planItem({
          id: "med1",
          priority: "medium",
          plannedStartTime: "2025-06-01T21:00:00.000Z",
          plannedEndTime: "2025-06-01T22:30:00.000Z",
          estimatedDurationMinutes: 180,
          travelTimeFromPreviousMinutes: 30,
        }),
      ],
    };
    const result = await replanTrip({ executionState: state, reason: "user_skipped_item" });
    expect(result.removedItems.some((r) => r.id === "low1")).toBe(true);
    expect(result.removedItems.some((r) => r.id === "must1")).toBe(false);
    expect(result.removedItems.some((r) => r.id === "med1")).toBe(true);
  });

  it("prefers a deterministic open replacement from the pool before calling AI", async () => {
    const closed = planItem({
      id: "closed",
      priority: "medium",
      title: "Museum",
      type: "museum",
      plannedStartTime: "2025-06-02T10:00:00.000Z",
      plannedEndTime: "2025-06-02T11:00:00.000Z",
      travelTimeFromPreviousMinutes: 10,
      openingHoursLabel: "Mo off",
      openingHoursTimezone: "UTC",
    });
    const openCandidate = planItem({
      id: "cand-open",
      priority: "low",
      title: "Park",
      type: "activity",
      plannedStartTime: "2025-06-02T08:00:00.000Z",
      plannedEndTime: "2025-06-02T09:00:00.000Z",
      openingHoursLabel: "Mo 09:00-18:00",
      openingHoursTimezone: "UTC",
    });
    const state: TripExecutionState = {
      now: "2025-06-02T10:15:00.000Z",
      dayStartTime: "08:00",
      dayEndTime: "22:00",
      completedItemIds: [],
      skippedItemIds: [],
      userMode: "balanced",
      items: [closed],
    };
    const suggestReplacement = vi.fn(async () => null);
    const result = await replanTrip(
      { executionState: state, reason: "place_closed", affectedItemId: "closed" },
      { replacementCandidates: [openCandidate], suggestReplacement },
    );
    expect(suggestReplacement).not.toHaveBeenCalled();
    const inserted = result.updatedItems.find((i) => i.title === "Park");
    expect(inserted).toBeDefined();
    expect(inserted?.estimatedDurationMinutes).toBe(closed.estimatedDurationMinutes);
  });

  it("prefers replacement candidates in the same geographic cluster when both are open", async () => {
    const closed = planItem({
      id: "closed",
      priority: "medium",
      title: "Museum",
      type: "museum",
      location: loc(48.86, 2.35),
      plannedStartTime: "2025-06-02T10:00:00.000Z",
      plannedEndTime: "2025-06-02T11:00:00.000Z",
      travelTimeFromPreviousMinutes: 10,
      openingHoursLabel: "Mo off",
      openingHoursTimezone: "UTC",
    });
    const farOpen = planItem({
      id: "cand-far",
      priority: "low",
      title: "Far park",
      type: "activity",
      location: loc(49.5, 2.9),
      plannedStartTime: "2025-06-02T08:00:00.000Z",
      plannedEndTime: "2025-06-02T09:00:00.000Z",
      openingHoursLabel: "Mo 09:00-18:00",
      openingHoursTimezone: "UTC",
    });
    const nearOpen = planItem({
      id: "cand-near",
      priority: "low",
      title: "Near park",
      type: "activity",
      location: loc(48.861, 2.351),
      plannedStartTime: "2025-06-02T08:00:00.000Z",
      plannedEndTime: "2025-06-02T09:00:00.000Z",
      openingHoursLabel: "Mo 09:00-18:00",
      openingHoursTimezone: "UTC",
    });
    const state: TripExecutionState = {
      now: "2025-06-02T10:15:00.000Z",
      dayStartTime: "08:00",
      dayEndTime: "22:00",
      completedItemIds: [],
      skippedItemIds: [],
      userMode: "balanced",
      items: [closed],
    };
    const result = await replanTrip(
      { executionState: state, reason: "place_closed", affectedItemId: "closed" },
      { replacementCandidates: [farOpen, nearOpen] },
    );
    const inserted = result.updatedItems.find((i) => i.title === "Near park");
    expect(inserted).toBeDefined();
  });

  it("replaces closed item deterministically or via hook", async () => {
    const closed = planItem({
      id: "closed",
      priority: "medium",
      title: "Museum",
      type: "museum",
      plannedStartTime: "2025-06-01T12:00:00.000Z",
      plannedEndTime: "2025-06-01T13:00:00.000Z",
      travelTimeFromPreviousMinutes: 10,
    });
    const state: TripExecutionState = {
      now: "2025-06-01T12:15:00.000Z",
      dayStartTime: "08:00",
      dayEndTime: "22:00",
      completedItemIds: [],
      skippedItemIds: [],
      userMode: "balanced",
      items: [closed],
    };
    const withAi = await replanTrip(
      { executionState: state, reason: "place_closed", affectedItemId: "closed" },
      {
        suggestReplacement: async () => ({
          ...closed,
          id: "ai-swap",
          title: "Gallery nearby",
        }),
      },
    );
    expect(withAi.updatedItems.some((i) => i.id === "ai-swap")).toBe(true);
    expect(withAi.updatedItems.some((i) => i.id === "closed")).toBe(false);
    expect(withAi.confidence).toBe("medium");
  });
});
