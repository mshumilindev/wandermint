import { describe, expect, it } from "vitest";
import type { RankedRecommendation } from "../recommendations/recommendation.types";
import { explainRecommendation } from "./explainRecommendation";

describe("explainRecommendation", () => {
  it("maps ranker reasons and penalties into PlanExplanation", () => {
    const ranked: RankedRecommendation = {
      item: {
        id: "i1",
        title: "Tile museum",
        type: "activity",
        priority: "high",
        location: { lat: 38.72, lng: -9.14 },
        plannedStartTime: "2026-06-01T11:00:00.000Z",
        plannedEndTime: "2026-06-01T12:30:00.000Z",
        estimatedDurationMinutes: 90,
        travelTimeFromPreviousMinutes: 12,
        status: "planned",
        travelEstimateConfidence: "low",
      },
      score: 612,
      reasons: ["Taste affinity for “museum” (+40)"],
      penalties: ["Opening hours unknown for planned slot (-55)"],
      confidence: "medium",
    };
    const ex = explainRecommendation(ranked);
    expect(ex.summary).toContain("Tile museum");
    expect(ex.includedBecause[0]).toContain("Taste affinity");
    expect(ex.risks[0]).toContain("Opening hours");
    expect(ex.lowConfidenceFields.some((l) => l.includes("low"))).toBe(true);
  });
});
