import { describe, expect, it } from "vitest";
import type { PlanWarning } from "../../entities/warning/model";
import type { UserOverride } from "./userOverride.types";
import {
  effectivePlanWarningSeverity,
  hasActiveUserOverride,
  overrideAppliesToTrip,
  userOverrideTypesForPlanWarning,
} from "./userOverridePresentation";

const warn = (partial: Partial<PlanWarning> & Pick<PlanWarning, "type" | "severity" | "message" | "userId" | "tripId">): PlanWarning => ({
  id: "w1",
  affectedBlockIds: [],
  suggestedAction: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...partial,
});

describe("userOverrideTypesForPlanWarning", () => {
  it("tags dense / active-minute route warnings", () => {
    const w = warn({
      type: "route_issue",
      severity: "warning",
      message: "Paris carries 6 stops, which is dense for this travel pace.",
      userId: "u1",
      tripId: "t1",
    });
    expect(userOverrideTypesForPlanWarning(w)).toContain("allow_dense_plan");
  });

  it("tags budget soft-limit warnings", () => {
    const w = warn({
      type: "price_change",
      severity: "warning",
      message: "Lyon pushes past the daily comfort budget.",
      userId: "u1",
      tripId: "t1",
    });
    expect(userOverrideTypesForPlanWarning(w)).toContain("ignore_budget_warning");
  });

  it("tags closed-place opening-hour warnings", () => {
    const w = warn({
      type: "opening_hours_change",
      severity: "critical",
      message: "Museum looks closed in that time window.",
      userId: "u1",
      tripId: "t1",
    });
    expect(userOverrideTypesForPlanWarning(w)).toContain("keep_closed_place");
  });
});

describe("effectivePlanWarningSeverity", () => {
  it("downgrades warning to info when a matching override exists", () => {
    const w = warn({
      type: "price_change",
      severity: "warning",
      message: "Daily comfort budget exceeded",
      userId: "u1",
      tripId: "t1",
    });
    const overrides: UserOverride[] = [
      {
        id: "o1",
        userId: "u1",
        tripId: "t1",
        type: "ignore_budget_warning",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(effectivePlanWarningSeverity(w, overrides)).toBe("info");
  });

  it("does not soften unrelated route issues", () => {
    const w = warn({
      type: "route_issue",
      severity: "critical",
      message: "Block has timing that runs backwards.",
      userId: "u1",
      tripId: "t1",
    });
    const overrides: UserOverride[] = [
      {
        id: "o1",
        userId: "u1",
        tripId: "t1",
        type: "allow_dense_plan",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(userOverrideTypesForPlanWarning(w)).toEqual([]);
    expect(effectivePlanWarningSeverity(w, overrides)).toBe("critical");
  });
});

describe("overrideAppliesToTrip / hasActiveUserOverride", () => {
  it("scopes trip-bound overrides to that trip only", () => {
    const o: UserOverride = {
      id: "o1",
      userId: "u1",
      tripId: "t1",
      type: "allow_dense_plan",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(overrideAppliesToTrip(o, "t1", Date.now())).toBe(true);
    expect(overrideAppliesToTrip(o, "t2", Date.now())).toBe(false);
    expect(hasActiveUserOverride([o], "u1", "allow_dense_plan", "t2")).toBe(false);
    expect(hasActiveUserOverride([o], "u1", "allow_dense_plan", "t1")).toBe(true);
  });

  it("treats global overrides (no tripId) as matching any trip", () => {
    const o: UserOverride = {
      id: "o1",
      userId: "u1",
      type: "ignore_low_confidence_data",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(hasActiveUserOverride([o], "u1", "ignore_low_confidence_data", "t9")).toBe(true);
  });
});
