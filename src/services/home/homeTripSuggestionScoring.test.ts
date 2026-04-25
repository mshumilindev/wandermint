import { describe, expect, it } from "vitest";
import type { HomeSuggestionContext } from "./homeTripSuggestionContextBuilder";
import { buildCuratedFallbackSuggestions, scoreHomeTripSuggestions } from "./homeTripSuggestionScoring";
import { refineTripSuggestions } from "./homeTripSuggestionAiLayer";

const emptyCtx = (overrides: Partial<HomeSuggestionContext> = {}): HomeSuggestionContext => ({
  userId: "test-user",
  travelBehavior: null,
  tripHistory: [],
  flickSync: { topTitles: [], topMediaTypes: [], interestSignals: [] },
  music: null,
  budget: { avgDailySpend: null, minDaily: null, maxDaily: null, currency: "USD", dominantStyle: "unknown" },
  bucketList: { rows: [], savedDestinations: [], savedActivities: [] },
  preferenceProfile: { avoid: [], prefer: [] },
  lastTripDate: null,
  tasteConfidence: 0,
  personalizationAllowed: true,
  ...overrides,
});

describe("scoreHomeTripSuggestions", () => {
  it("returns curated-style exploration when history is empty", () => {
    const rows = scoreHomeTripSuggestions(emptyCtx(), 5);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.destination.country.length > 0)).toBe(true);
  });

  it("prioritizes bucket list destinations with country", () => {
    const ctx = emptyCtx({
      bucketList: {
        rows: [
          {
            id: "b1",
            payloadType: "destination",
            title: "Marrakesh, Morocco",
            country: "Morocco",
            city: "Marrakesh",
            priority: "high",
            updatedAt: "2026-04-01",
            touchCount: 2,
            feasibilityScore: 0.95,
          },
        ],
        savedDestinations: [
          {
            id: "b1",
            title: "Marrakesh, Morocco",
            country: "Morocco",
            city: "Marrakesh",
            priority: "high",
          },
        ],
        savedActivities: [],
      },
    });
    const rows = scoreHomeTripSuggestions(ctx, 8);
    const bucket = rows.find((r) => r.type === "bucket_list_push");
    expect(bucket).toBeDefined();
    expect(bucket?.destination.country).toBe("Morocco");
  });

  it("surfaces return trips for high-execution history", () => {
    const ctx = emptyCtx({
      tripHistory: [
        {
          tripId: "t1",
          title: "Spring city break",
          status: "completed",
          destinations: [{ city: "Lisbon", country: "Portugal" }],
          durationDays: 4,
          executionScore: 0.9,
          endedAt: "2025-03-01",
        },
      ],
      travelBehavior: {
        planningStyle: "realistic",
        executionStyle: "balanced",
        categoryAffinity: { museums: 0.8 },
        skipPatterns: { averageSkipRate: 0.1, averageCompletionRate: 0.82 },
      },
      lastTripDate: "2025-03-01",
    });
    const rows = scoreHomeTripSuggestions(ctx, 8);
    const ret = rows.find((r) => r.type === "return_trip");
    expect(ret).toBeDefined();
    expect(ret?.destination.city).toBe("Lisbon");
  });
});

describe("refineTripSuggestions", () => {
  it("does not change destination, duration, or budget envelopes", async () => {
    const ctx = emptyCtx();
    const candidates = scoreHomeTripSuggestions(ctx, 3);
    const refined = await refineTripSuggestions(candidates, ctx);
    for (let i = 0; i < refined.length; i++) {
      const before = candidates.find((c) => c.id === refined[i]!.id);
      expect(before).toBeDefined();
      expect(refined[i]!.destination).toEqual(before!.destination);
      expect(refined[i]!.durationDays).toBe(before!.durationDays);
      expect(refined[i]!.estimatedBudget).toEqual(before!.estimatedBudget);
    }
  });
});

describe("buildCuratedFallbackSuggestions", () => {
  it("never returns an empty list", () => {
    const rows = buildCuratedFallbackSuggestions("EUR");
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]!.estimatedBudget.currency).toBe("EUR");
  });
});
