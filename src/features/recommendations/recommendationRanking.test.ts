import { describe, expect, it } from "vitest";
import type { MemoryTripConstraints } from "../memory/memory.types";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import type { TravelTasteProfile } from "../user-taste/travelTaste.types";
import type { TravelBehaviorProfile } from "../user-behavior/travelBehavior.types";
import type { EntityReliabilityMap } from "../data-quality/sourceReliability.types";
import { rankRecommendations } from "./recommendationRanking";
import type { RecommendationCandidate } from "./recommendation.types";

const baseTripConstraints = (): MemoryTripConstraints => ({
  budget: { amount: 2000, currency: "EUR", style: "balanced", dailySoftLimit: 220 },
  dateRange: { start: "2026-06-01", end: "2026-06-05" },
  destination: "Lisbon",
  tripSegments: [
    {
      id: "s1",
      city: "Lisbon",
      country: "PT",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      hotelInfo: {},
    },
  ],
  planningMode: "city_first",
  flightInfo: {},
  hotelInfo: {},
  anchorEvents: [],
});

const item = (overrides: Partial<TripPlanItem>): TripPlanItem => ({
  id: "i1",
  title: "Hidden ramen counter",
  type: "meal",
  priority: "medium",
  location: { lat: 38.72, lng: -9.14 },
  plannedStartTime: "2026-06-02T12:00:00.000Z",
  plannedEndTime: "2026-06-02T13:30:00.000Z",
  estimatedDurationMinutes: 60,
  travelTimeFromPreviousMinutes: 12,
  status: "planned",
  ...overrides,
});

const strongReliability: EntityReliabilityMap = {
  title: { source: "google_places", confidence: 0.9 },
  location: { source: "google_places", confidence: 0.92 },
  openingHours: { source: "google_places", confidence: 0.88 },
};

describe("rankRecommendations", () => {
  it("orders closed candidates below open ones deterministically", () => {
    const constraints = baseTripConstraints();
    const a: RecommendationCandidate = {
      item: item({ id: "open", title: "Open cafe" }),
      category: "cafe",
      reliability: strongReliability,
      openingHoursCheck: { result: { status: "open" }, slotInvalid: false },
    };
    const b: RecommendationCandidate = {
      item: item({ id: "closed", title: "Closed museum" }),
      category: "museum",
      reliability: strongReliability,
      openingHoursCheck: {
        result: { status: "closed", reason: "Monday closure" },
        slotInvalid: true,
      },
    };
    const ranked = rankRecommendations({
      candidates: [b, a],
      tripConstraints: constraints,
      userTasteProfile: null,
      behaviorProfile: null,
    });
    expect(ranked[0]!.item.id).toBe("open");
    expect(ranked[0]!.penalties.length).toBe(0);
    expect(ranked[1]!.penalties.some((p) => p.includes("Closed"))).toBe(true);
  });

  it("boosts must-see substring matches with explicit reasons", () => {
    const constraints = baseTripConstraints();
    const plain = item({ id: "plain", title: "Generic walk" });
    const must = item({ id: "must", title: "Miradouro da Senhora do Monte" });
    const ranked = rankRecommendations({
      candidates: [
        { item: plain, category: "walk", reliability: strongReliability },
        { item: must, category: "landmark", reliability: strongReliability },
      ],
      tripConstraints: constraints,
      userTasteProfile: null,
      behaviorProfile: null,
      clustering: { mustSeeTerms: ["miradouro"] },
    });
    expect(ranked[0]!.item.id).toBe("must");
    expect(ranked[0]!.reasons.some((r) => r.includes("Must-see"))).toBe(true);
  });

  it("applies taste affinity when confidence is sufficient", () => {
    const taste: TravelTasteProfile = {
      userId: "u1",
      categoryAffinity: { museum: 0.72 },
      cuisineAffinity: {},
      experienceAffinity: {},
      dislikedPatterns: [],
      favoritePatterns: [],
      confidence: 0.5,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const constraints = baseTripConstraints();
    const museum = item({ id: "m", title: "National Tile Museum", type: "activity" });
    const food = item({ id: "f", title: "Lunch spot", type: "meal" });
    const ranked = rankRecommendations({
      candidates: [
        { item: food, category: "food", reliability: strongReliability },
        { item: museum, category: "museum", reliability: strongReliability },
      ],
      tripConstraints: constraints,
      userTasteProfile: taste,
      behaviorProfile: null,
    });
    expect(ranked[0]!.item.id).toBe("m");
    expect(ranked[0]!.reasons.some((r) => r.includes("Taste affinity"))).toBe(true);
  });

  it("penalizes long travel from previous stop", () => {
    const constraints = baseTripConstraints();
    const near = item({ id: "near", travelTimeFromPreviousMinutes: 8 });
    const far = item({ id: "far", travelTimeFromPreviousMinutes: 75 });
    const ranked = rankRecommendations({
      candidates: [
        { item: far, reliability: strongReliability },
        { item: near, reliability: strongReliability },
      ],
      tripConstraints: constraints,
      userTasteProfile: null,
      behaviorProfile: null,
      mobilityTolerance: "medium",
    });
    expect(ranked[0]!.item.id).toBe("near");
    expect(ranked[1]!.penalties.some((p) => p.includes("Travel from previous"))).toBe(true);
  });

  it("tie-breaks equal scores by item id", () => {
    const constraints = baseTripConstraints();
    const ranked = rankRecommendations({
      candidates: [
        { item: item({ id: "z-last", title: "A" }), reliability: strongReliability },
        { item: item({ id: "a-first", title: "B" }), reliability: strongReliability },
      ],
      tripConstraints: constraints,
      userTasteProfile: null,
      behaviorProfile: null,
    });
    expect(ranked[0]!.item.id).toBe("a-first");
    expect(ranked[1]!.item.id).toBe("z-last");
  });

  it("adds behavior-aware penalty for tight stops when skip rate is high", () => {
    const behavior: TravelBehaviorProfile = {
      userId: "u1",
      totalTrips: 4,
      totalPlannedItems: 40,
      totalCompletedItems: 20,
      totalSkippedItems: 18,
      averageCompletionRate: 0.5,
      averageSkipRate: 0.45,
      averageDelayMinutes: 12,
      preferredPace: "balanced",
      planningBias: "realistic",
      lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    };
    const constraints = baseTripConstraints();
    const tight = item({
      id: "tight",
      estimatedDurationMinutes: 20,
      priority: "medium",
      plannedStartTime: "2026-06-02T10:00:00.000Z",
      plannedEndTime: "2026-06-02T10:35:00.000Z",
      travelTimeFromPreviousMinutes: 5,
    });
    const ranked = rankRecommendations({
      candidates: [{ item: tight, reliability: strongReliability }],
      tripConstraints: constraints,
      userTasteProfile: null,
      behaviorProfile: behavior,
    });
    expect(ranked[0]!.penalties.some((p) => p.includes("skip rate"))).toBe(true);
  });
});
