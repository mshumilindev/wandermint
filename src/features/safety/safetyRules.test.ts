import { describe, expect, it } from "vitest";
import type { ActivityBlock, MovementLeg } from "../../entities/activity/model";
import { assessActivityBlockSafety, collectSafetyPlanningTradeoffs, applySafetyAcknowledgementForDisplay } from "./safetyRules";
import type { DayPlan } from "../../entities/day-plan/model";

const baseBlock = (overrides: Partial<ActivityBlock>): ActivityBlock =>
  ({
    id: "b1",
    type: "activity",
    title: "Stroll",
    description: "",
    startTime: "10:00",
    endTime: "11:00",
    category: "walk",
    tags: [],
    indoorOutdoor: "outdoor",
    estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
    dependencies: {
      weatherSensitive: true,
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

const walkingLeg = (minutes: number, confidence?: "high" | "medium" | "low"): MovementLeg => ({
  id: "leg1",
  fromBlockId: "a",
  toBlockId: "b1",
  summary: "walk",
  primary: {
    mode: "walking",
    durationMinutes: minutes,
    certainty: "partial",
    sourceName: "test",
    estimateConfidence: confidence,
  },
  alternatives: [],
});

describe("assessActivityBlockSafety", () => {
  it("returns low for meal stops", () => {
    const r = assessActivityBlockSafety(
      baseBlock({ type: "meal", title: "Dinner", indoorOutdoor: "indoor", startTime: "22:00", endTime: "23:30" }),
    );
    expect(r.riskLevel).toBe("low");
    expect(r.reasons).toHaveLength(0);
  });

  it("flags late outdoor viewpoint with long walk as elevated risk", () => {
    const block = baseBlock({
      title: "Sunset viewpoint trail",
      category: "viewpoint",
      indoorOutdoor: "outdoor",
      startTime: "22:00",
      endTime: "22:45",
      place: {
        provider: "test",
        name: "Ridge",
        latitude: 40,
        longitude: -74,
        capturedAt: new Date().toISOString(),
      },
      normalizedTripPlanItem: {
        priority: "high",
        status: "planned",
        estimatedDurationMinutes: 45,
        travelTimeFromPreviousMinutes: 30,
        locationResolutionStatus: "resolved",
      },
    });
    const r = assessActivityBlockSafety(block, walkingLeg(35, "high"));
    expect(r.riskLevel).toBe("high");
    expect(r.reasons).toContain("late_evening_outdoor_remote");
  });

  it("uses unknown when location is incomplete", () => {
    const block = baseBlock({
      title: "Night viewpoint",
      category: "viewpoint",
      indoorOutdoor: "outdoor",
      startTime: "22:00",
      endTime: "22:30",
    });
    const r = assessActivityBlockSafety(block, walkingLeg(10, "high"));
    expect(r.riskLevel).toBe("high");
    expect(r.reasons).toContain("location_data_incomplete");
  });

  it("suppresses display assessment after user acknowledgement", () => {
    const block = baseBlock({
      title: "Late ridge",
      category: "viewpoint",
      indoorOutdoor: "outdoor",
      startTime: "22:00",
      endTime: "22:30",
      safetyWarningAcknowledged: true,
    });
    const raw = assessActivityBlockSafety(block, walkingLeg(40));
    const shown = applySafetyAcknowledgementForDisplay(raw, block);
    expect(shown.riskLevel).toBe("low");
    expect(shown.reasons).toContain("user_acknowledged");
  });
});

describe("collectSafetyPlanningTradeoffs", () => {
  it("emits a tradeoff when multiple heavy late-outdoor stops exist", () => {
    const mkLeg = (from: string, to: string, minutes: number): MovementLeg => ({
      id: `leg-${from}-${to}`,
      fromBlockId: from,
      toBlockId: to,
      summary: "walk",
      primary: {
        mode: "walking",
        durationMinutes: minutes,
        certainty: "partial",
        sourceName: "test",
        estimateConfidence: "medium",
      },
      alternatives: [],
    });

    const day: DayPlan = {
      id: "d1",
      userId: "u",
      tripId: "t",
      segmentId: "s",
      cityLabel: "X",
      date: "2026-08-01",
      theme: "",
      blocks: [
        baseBlock({
          id: "x1",
          title: "Ridge viewpoint",
          category: "viewpoint",
          indoorOutdoor: "outdoor",
          startTime: "22:00",
          endTime: "22:30",
        }),
        baseBlock({
          id: "x2",
          title: "Cliff lookout",
          category: "viewpoint",
          indoorOutdoor: "outdoor",
          startTime: "22:45",
          endTime: "23:15",
        }),
      ],
      movementLegs: [mkLeg("z0", "x1", 32), mkLeg("x1", "x2", 32)],
      estimatedCostRange: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
      validationStatus: "fresh",
      warnings: [],
      completionStatus: "pending",
      updatedAt: new Date().toISOString(),
    };
    const hints = collectSafetyPlanningTradeoffs(day);
    expect(hints.length).toBeGreaterThan(0);
  });
});
