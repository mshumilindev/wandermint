import { describe, expect, it } from "vitest";
import type { EventLookupResult } from "../../entities/events/eventLookup.model";
import { dedupeEventResults, sortEventResults } from "./eventNormalizer";

const base = (overrides: Partial<EventLookupResult>): EventLookupResult => ({
  id: "x",
  provider: "ticketmaster",
  title: "Test Event",
  eventType: "concert",
  confidence: 0.8,
  ...overrides,
});

describe("dedupeEventResults", () => {
  it("removes duplicates by provider id", () => {
    const a = base({ id: "1", providerEventId: "tm-1", title: "Same" });
    const b = base({ id: "2", providerEventId: "tm-1", title: "Same" });
    expect(dedupeEventResults([a, b])).toHaveLength(1);
  });
});

describe("sortEventResults", () => {
  it("orders upcoming sooner first when scores tie on confidence", () => {
    const a = base({ id: "a", title: "Alpha night", startDate: "2030-06-01", confidence: 0.7 });
    const b = base({ id: "b", title: "Beta night", startDate: "2030-05-01", confidence: 0.7 });
    const sorted = sortEventResults([a, b], "night", "upcoming");
    expect(sorted[0]?.startDate).toBe("2030-05-01");
  });
});
