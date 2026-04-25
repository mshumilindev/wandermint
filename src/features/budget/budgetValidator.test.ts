import { describe, expect, it } from "vitest";
import type { ActivityBlock, MovementLeg } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { TripBudget } from "../../entities/trip/model";
import { pricingService } from "../../services/pricing/pricingService";
import { repairDayPlanBudgetIfNeeded, validateDayPlanBudget } from "./budgetValidator";

const baseDeps = (): ActivityBlock["dependencies"] => ({
  weatherSensitive: false,
  bookingRequired: false,
  openingHoursSensitive: false,
  priceSensitive: false,
});

const block = (overrides: Partial<ActivityBlock>): ActivityBlock => ({
  id: overrides.id ?? "b1",
  type: overrides.type ?? "activity",
  title: overrides.title ?? "Step",
  description: "",
  startTime: overrides.startTime ?? "09:00",
  endTime: overrides.endTime ?? "10:00",
  category: overrides.category ?? "sightseeing",
  tags: [],
  indoorOutdoor: "outdoor",
  estimatedCost: overrides.estimatedCost ?? { min: 20, max: 40, currency: "EUR", certainty: "estimated" },
  dependencies: baseDeps(),
  alternatives: [],
  sourceSnapshots: [],
  priority: "should",
  locked: false,
  completionStatus: "pending",
  place: overrides.place,
  ...overrides,
});

const dayShell = (partial: Partial<DayPlan> & Pick<DayPlan, "blocks">): DayPlan => ({
  id: "d1",
  userId: "u1",
  tripId: "t1",
  segmentId: "s1",
  cityLabel: partial.cityLabel ?? "Lyon",
  countryLabel: partial.countryLabel ?? "France",
  date: "2026-06-01",
  theme: "test",
  blocks: partial.blocks,
  movementLegs: partial.movementLegs,
  estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
  validationStatus: "fresh",
  warnings: [],
  completionStatus: "pending",
  updatedAt: new Date().toISOString(),
});

const tripBudget = (): TripBudget => ({
  amount: 2000,
  currency: "EUR",
  style: "balanced",
  dailySoftLimit: 400,
});

describe("validateDayPlanBudget", () => {
  it("returns neutral validation for an empty day (no blocks)", () => {
    const d = dayShell({ blocks: [] });
    const v = validateDayPlanBudget(d, tripBudget());
    expect(v.suspiciousItems).toHaveLength(0);
    expect(v.totalMin).toBe(0);
    expect(v.totalMax).toBe(0);
  });

  it("flags an unrealistically cheap restaurant-style meal for the city band", () => {
    const meal = block({
      id: "meal-cheap",
      type: "meal",
      title: "Lunch cafe",
      estimatedCost: { min: 0.5, max: 1, currency: "EUR", certainty: "estimated" },
    });
    const d = dayShell({ blocks: [meal] });
    const v = validateDayPlanBudget(d, tripBudget());
    expect(v.suspiciousItems.some((s) => s.itemId === "meal-cheap" && s.reason.toLowerCase().includes("cheap"))).toBe(true);
  });

  it("flags an unrealistically expensive restaurant-style meal for the city band", () => {
    const meal = block({
      id: "meal-1",
      type: "meal",
      title: "Dinner reservation",
      estimatedCost: { min: 400, max: 420, currency: "EUR", certainty: "estimated" },
    });
    const d = dayShell({ blocks: [meal] });
    const v = validateDayPlanBudget(d, tripBudget());
    expect(v.suspiciousItems.some((s) => s.itemId === "meal-1" && s.reason.includes("expensive"))).toBe(true);
  });

  it("flags movement cost inconsistent with distance", () => {
    const a = block({ id: "a", startTime: "09:00", endTime: "10:00", title: "A", estimatedCost: { min: 0, max: 0, currency: "PLN", certainty: "exact" } });
    const b = block({
      id: "b",
      startTime: "10:30",
      endTime: "11:00",
      title: "B",
      estimatedCost: { min: 0, max: 0, currency: "PLN", certainty: "exact" },
    });
    const leg: MovementLeg = {
      id: "leg-1",
      fromBlockId: "a",
      toBlockId: "b",
      summary: "Taxi",
      distanceMeters: 3000,
      primary: {
        mode: "taxi",
        durationMinutes: 12,
        estimatedCost: { min: 800, max: 900, currency: "PLN", certainty: "estimated" },
        certainty: "partial",
        sourceName: "test",
      },
      alternatives: [],
    };
    const d = dayShell({ cityLabel: "Warsaw", countryLabel: "Poland", blocks: [a, b], movementLegs: [leg] });
    const v = validateDayPlanBudget(d, { ...tripBudget(), currency: "PLN" });
    expect(v.suspiciousItems.some((s) => s.itemId === "leg-1")).toBe(true);
  });

  it("warns when a block uses a single exact AI price", () => {
    const meal = block({
      id: "m2",
      type: "meal",
      title: "Lunch",
      estimatedCost: { min: 32, max: 32, currency: "EUR", certainty: "exact" },
    });
    const d = dayShell({ blocks: [meal] });
    const v = validateDayPlanBudget(d, tripBudget());
    expect(v.warnings.some((w) => w.includes("single exact price"))).toBe(true);
  });

  it("sets shouldLabelEstimated when cost certainty is unknown", () => {
    const x = block({
      estimatedCost: { min: 10, max: 30, currency: "EUR", certainty: "unknown" },
    });
    const v = validateDayPlanBudget(dayShell({ blocks: [x] }), tripBudget());
    expect(v.shouldLabelEstimated).toBe(true);
  });
});

describe("repairDayPlanBudgetIfNeeded", () => {
  it("replaces suspicious block costs with profile-based ranges", () => {
    const meal = block({
      id: "meal-bad",
      type: "meal",
      title: "Very expensive dinner",
      estimatedCost: { min: 500, max: 520, currency: "EUR", certainty: "estimated" },
    });
    const d0 = dayShell({ blocks: [meal] });
    expect(validateDayPlanBudget(d0, tripBudget()).suspiciousItems.length).toBeGreaterThan(0);
    const d1 = repairDayPlanBudgetIfNeeded(d0, tripBudget());
    const repaired = d1.blocks.find((b) => b.id === "meal-bad");
    expect(repaired).toBeDefined();
    const ref = pricingService.estimateActivityCost({
      type: "meal",
      category: repaired!.category,
      place: repaired!.place,
      city: d1.cityLabel,
      country: d1.countryLabel,
      locationLabel: `${d1.cityLabel}, ${d1.countryLabel}`,
      budgetStyle: "balanced",
    });
    expect(repaired!.estimatedCost.min).toBe(ref.min);
    expect(repaired!.estimatedCost.max).toBe(ref.max);
    expect(repaired!.estimatedCost.certainty).toBe("estimated");
    expect(validateDayPlanBudget(d1, tripBudget()).suspiciousItems.length).toBe(0);
  });
});
