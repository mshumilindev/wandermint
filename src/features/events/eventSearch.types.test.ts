import { describe, expect, it } from "vitest";
import { defaultFestivalDateSelection, enumerateInclusiveDates, isMultiDayFestivalResult } from "./eventSearch.types";
import type { EventSearchResult } from "./eventSearch.types";

describe("enumerateInclusiveDates", () => {
  it("returns inclusive UTC calendar days", () => {
    expect(enumerateInclusiveDates("2026-01-01", "2026-01-03")).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});

describe("defaultFestivalDateSelection", () => {
  it("defaults to first day only for multi-day festivals", () => {
    const row: EventSearchResult = {
      id: "1",
      title: "Fest",
      type: "festival",
      venueName: "Field",
      city: "X",
      country: "Y",
      startDate: "2026-06-01T12:00:00.000Z",
      endDate: "2026-06-03T12:00:00.000Z",
      source: "ticketmaster",
      confidenceScore: 0.9,
    };
    expect(isMultiDayFestivalResult(row)).toBe(true);
    const sel = defaultFestivalDateSelection(row);
    expect(sel?.mode).toBe("single_day");
    expect(sel?.selectedDates).toEqual(["2026-06-01"]);
  });
});
