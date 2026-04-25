import { describe, expect, it } from "vitest";
import {
  AI_GENERATED_CONFIDENCE_CEILING,
  applyCacheDecay,
  compareFieldCandidates,
  effectiveFieldScore,
  getLowConfidenceWarnings,
  isAuthoritative,
  LOCAL_CACHE_HALF_LIFE_MS,
  mergeEntityReliabilityMaps,
  pickBestFieldReliability,
} from "./sourceReliability";

describe("sourceReliability", () => {
  it("caps ai_generated confidence and never marks it authoritative", () => {
    const fr = { source: "ai_generated" as const, confidence: 0.99, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };
    const d = applyCacheDecay(fr);
    expect(d.confidence).toBeLessThanOrEqual(AI_GENERATED_CONFIDENCE_CEILING);
    expect(isAuthoritative(d)).toBe(false);
  });

  it("lets manual_user_input win over google_places when scores are close", () => {
    const manual = { source: "manual_user_input" as const, confidence: 0.8, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };
    const google = { source: "google_places" as const, confidence: 0.81, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };
    expect(compareFieldCandidates(manual, google, "openingHours", Date.parse("2026-01-02"))).toBeGreaterThan(0);
  });

  it("decays local_cache confidence by half-life", () => {
    const t0 = Date.parse("2026-06-01T12:00:00.000Z");
    const fr = { source: "local_cache" as const, confidence: 1, lastVerifiedAt: "2026-06-01T12:00:00.000Z" };
    const atHalfLife = applyCacheDecay(fr, t0 + LOCAL_CACHE_HALF_LIFE_MS);
    expect(atHalfLife.confidence).toBeCloseTo(0.5, 5);
  });

  it("prefers ticketmaster over wikimedia for eventDate", () => {
    const wiki = { source: "wikimedia" as const, confidence: 0.95, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };
    const tm = { source: "ticketmaster" as const, confidence: 0.7, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };
    expect(effectiveFieldScore(tm, "eventDate")).toBeGreaterThan(effectiveFieldScore(wiki, "eventDate"));
    expect(pickBestFieldReliability([wiki, tm], "eventDate")?.source).toBe("ticketmaster");
  });

  it("mergeEntityReliabilityMaps picks best per field", () => {
    const a = {
      eventDate: { source: "wikimedia" as const, confidence: 0.9, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
      image: { source: "wikimedia" as const, confidence: 0.85, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
    };
    const b = {
      eventDate: { source: "ticketmaster" as const, confidence: 0.75, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
    };
    const m = mergeEntityReliabilityMaps([a, b]);
    expect(m.eventDate?.source).toBe("ticketmaster");
    expect(m.image?.source).toBe("wikimedia");
  });

  it("surfaces low-confidence and wrong-provider warnings for critical fields", () => {
    const map = {
      openingHours: { source: "wikimedia" as const, confidence: 0.95, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
      eventDate: { source: "openstreetmap" as const, confidence: 0.95, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
    };
    const w = getLowConfidenceWarnings(map, ["openingHours", "eventDate"]);
    expect(w.map((x) => x.field).sort()).toEqual(["eventDate", "openingHours"].sort());
  });

  it("does not warn for google_places eventDate when confidence is high", () => {
    const map = {
      eventDate: { source: "google_places" as const, confidence: 0.9, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
    };
    expect(getLowConfidenceWarnings(map, ["eventDate"])).toHaveLength(0);
  });
});
