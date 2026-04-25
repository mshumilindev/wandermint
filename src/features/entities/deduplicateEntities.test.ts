import { describe, expect, it } from "vitest";
import { deduplicateEntities, computeEntityMergeScore } from "./deduplicateEntities";
import { normalizeEntityNameForMatching, resolveEventEntity, resolvePlaceLikeEntity } from "./entityResolver";

describe("normalizeEntityNameForMatching", () => {
  it("lowercases, trims, strips punctuation, strips matching-only suffix tokens", () => {
    expect(normalizeEntityNameForMatching("  The Louvre Museum! ")).toBe("the louvre");
    expect(normalizeEntityNameForMatching("British Museum London")).toBe("british london");
  });
});

describe("deduplicateEntities", () => {
  it("merges duplicate places when name and coordinates agree", () => {
    const a = resolvePlaceLikeEntity({
      name: "Central Park",
      latitude: 40.7829,
      longitude: -73.9654,
      source: "providerA",
      confidenceScore: 0.9,
    });
    const b = resolvePlaceLikeEntity({
      name: "central park",
      latitude: 40.7831,
      longitude: -73.9652,
      source: "providerB",
      confidenceScore: 0.85,
    });
    const out = deduplicateEntities([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]?.sources.sort()).toEqual(["providerA", "providerB"]);
    expect(out[0]?.aliases.length).toBeGreaterThan(0);
  });

  it("does not merge when confidence is at or below low cutoff", () => {
    const hi = resolvePlaceLikeEntity({
      name: "Same Name",
      latitude: 40.0,
      longitude: -74.0,
      source: "a",
      confidenceScore: 0.9,
    });
    const lo = resolvePlaceLikeEntity({
      name: "Same Name",
      latitude: 40.0001,
      longitude: -74.0001,
      source: "b",
      confidenceScore: 0.35,
    });
    const out = deduplicateEntities([hi, lo], { lowConfidenceMergeCutoff: 0.38 });
    expect(out).toHaveLength(2);
  });

  it("merges events on same date with similar venue and title", () => {
    const e1 = resolveEventEntity({
      title: "Jazz Night",
      venueName: "Blue Note NYC",
      dateYmd: "2026-06-01",
      source: "a",
      confidenceScore: 0.88,
    });
    const e2 = resolveEventEntity({
      title: "Jazz Night!",
      venueName: "Blue Note — NYC",
      dateYmd: "2026-06-01",
      source: "b",
      confidenceScore: 0.82,
    });
    const out = deduplicateEntities([e1, e2]);
    expect(out).toHaveLength(1);
    expect(out[0]?.confidenceScore).toBeGreaterThanOrEqual(0.88);
  });

  it("does not merge events on different dates", () => {
    const e1 = resolveEventEntity({
      title: "Same Show",
      venueName: "Arena",
      dateYmd: "2026-06-01",
      source: "a",
      confidenceScore: 0.9,
    });
    const e2 = resolveEventEntity({
      title: "Same Show",
      venueName: "Arena",
      dateYmd: "2026-06-02",
      source: "b",
      confidenceScore: 0.9,
    });
    expect(computeEntityMergeScore(e1, e2, 450)).toBe(0);
    expect(deduplicateEntities([e1, e2])).toHaveLength(2);
  });
});
