import { describe, expect, it } from "vitest";
import { resolveTripOptionCount, resolveTripOptionCountFromDraft } from "./tripOptionCountService";

describe("resolveTripOptionCount", () => {
  it("targets 2 for single-day trips", () => {
    const p = resolveTripOptionCount({ durationDays: 1, segmentCount: 1, planningMode: "city_first" });
    expect(p.target).toBe(2);
    expect(p.max).toBeLessThanOrEqual(3);
  });

  it("allows up to 5 for long multi-city trips", () => {
    const p = resolveTripOptionCount({
      durationDays: 10,
      segmentCount: 4,
      planningMode: "city_first",
      personalizationRichness: 0.8,
    });
    expect(p.max).toBe(5);
    expect(p.target).toBeGreaterThanOrEqual(4);
  });

  it("respects explicit user count within bounds", () => {
    const p = resolveTripOptionCount({
      durationDays: 3,
      segmentCount: 1,
      planningMode: "city_first",
      userRequestedOptionCount: 4,
    });
    expect(p.target).toBe(4);
  });

  it("reduces for event-led constraints", () => {
    const p = resolveTripOptionCount({ durationDays: 5, segmentCount: 2, planningMode: "event_led" });
    expect(p.max).toBeLessThanOrEqual(3);
  });
});

describe("resolveTripOptionCountFromDraft", () => {
  it("uses draft shape", () => {
    const p = resolveTripOptionCountFromDraft({
      planningMode: "city_first",
      dateRange: { start: "2026-06-01", end: "2026-06-01" },
      tripSegments: [{ city: "x", country: "y" }],
      anchorEvents: [],
    });
    expect(p.target).toBe(2);
  });
});
