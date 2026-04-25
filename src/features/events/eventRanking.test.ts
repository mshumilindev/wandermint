import { describe, expect, it } from "vitest";
import {
  dateRangesOverlap,
  dedupeEventSearchResults,
  scoreEventForContext,
  sortBackfillSearchResults,
  sortUpcomingSearchResults,
  tripEventOverlapDays,
} from "./eventRanking";
import type { EventSearchResult } from "./eventSearch.types";

const e = (overrides: Partial<EventSearchResult> & Pick<EventSearchResult, "id" | "title" | "startDate">): EventSearchResult => ({
  type: "concert",
  venueName: "Hall",
  city: "Berlin",
  country: "DE",
  source: "ticketmaster",
  confidenceScore: 0.7,
  ...overrides,
});

describe("dedupeEventSearchResults", () => {
  it("returns an empty array for an empty input", () => {
    expect(dedupeEventSearchResults([])).toEqual([]);
  });

  it("merges duplicate rows and combines sources", () => {
    const a = e({ id: "1", title: "Same Show", startDate: "2026-07-01", venueName: "Arena", source: "ticketmaster" });
    const b = e({ id: "2", title: "Same Show", startDate: "2026-07-01", venueName: "Arena", source: "songkick", confidenceScore: 0.85 });
    const out = dedupeEventSearchResults([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toContain("ticketmaster");
    expect(out[0]?.source).toContain("songkick");
    expect(out[0]?.confidenceScore).toBe(0.85);
  });

  it("collapses three duplicate listings into one merged row", () => {
    const a = e({ id: "1", title: "Arena Night", startDate: "2026-08-01", venueName: "Arena", source: "a", confidenceScore: 0.5 });
    const b = e({ id: "2", title: "Arena Night", startDate: "2026-08-01", venueName: "Arena", source: "b", confidenceScore: 0.9 });
    const c = e({ id: "3", title: "Arena Night", startDate: "2026-08-01", venueName: "Arena", source: "c", confidenceScore: 0.6 });
    const out = dedupeEventSearchResults([a, b, c]);
    expect(out).toHaveLength(1);
    expect(out[0]?.confidenceScore).toBe(0.9);
    expect(out[0]?.source).toContain("a");
    expect(out[0]?.source).toContain("b");
    expect(out[0]?.source).toContain("c");
  });
});

describe("sortUpcomingSearchResults", () => {
  it("orders by start date ascending then higher relevance", () => {
    const items = [
      e({ id: "b", title: "Night in Paris", startDate: "2026-08-02", city: "Paris", country: "FR" }),
      e({ id: "a", title: "Night in Paris", startDate: "2026-08-01", city: "Paris", country: "FR" }),
    ];
    const sorted = sortUpcomingSearchResults(items, {
      query: "Night in Paris",
      mode: "upcoming",
      tripCity: "Paris",
      tripCountry: "FR",
    });
    expect(sorted.map((x) => x.id).join(",")).toBe("a,b");
  });
});

describe("scoreEventForContext", () => {
  it("weights exact title and trip overlap in past mode", () => {
    const exact = e({ id: "x", title: "Glastonbury", startDate: "2025-06-27", endDate: "2025-06-29", type: "festival" });
    const vague = e({ id: "y", title: "Random gig", startDate: "2025-06-28", type: "concert" });
    const ctx = {
      query: "Glastonbury",
      mode: "past" as const,
      tripStartDate: "2025-06-28",
      tripEndDate: "2025-06-28",
    };
    expect(scoreEventForContext(exact, ctx)).toBeGreaterThan(scoreEventForContext(vague, ctx));
  });
});

describe("tripEventOverlapDays", () => {
  it("counts inclusive overlap days", () => {
    expect(tripEventOverlapDays("2025-06-27", "2025-06-29", "2025-06-28", "2025-06-28")).toBe(1);
    expect(tripEventOverlapDays("2025-06-27", "2025-06-29", "2025-06-27", "2025-06-29")).toBe(3);
  });
});

describe("dateRangesOverlap", () => {
  it("detects touching ranges", () => {
    expect(dateRangesOverlap("2025-06-01", "2025-06-01", "2025-06-01", "2025-06-01")).toBe(true);
    expect(dateRangesOverlap("2025-06-01", "2025-06-02", "2025-06-03", "2025-06-04")).toBe(false);
  });
});

describe("sortBackfillSearchResults", () => {
  it("sorts chronologically for past context", () => {
    const items = [
      e({ id: "late", title: "B", startDate: "2024-09-10" }),
      e({ id: "early", title: "A", startDate: "2024-09-02" }),
    ];
    const sorted = sortBackfillSearchResults(items, { query: "A", mode: "past" });
    expect(sorted[0]?.id).toBe("early");
  });
});
