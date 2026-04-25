import { describe, expect, it } from "vitest";
import { analyzeTravelTimingRaw, calendarDayMatchesRuleWindow, resolveTimingCountryKey, suggestBetterDates } from "./travelTimingService";
import type { StaticTimingRule } from "./travelTimingData";
import dayjs from "dayjs";

describe("resolveTimingCountryKey", () => {
  it("maps country names", () => {
    expect(resolveTimingCountryKey({ country: "Japan" })).toBe("japan");
    expect(resolveTimingCountryKey({ country: "Croatia" })).toBe("croatia");
  });

  it("maps city when country missing", () => {
    expect(resolveTimingCountryKey({ country: "", city: "Kyoto" })).toBe("japan");
    expect(resolveTimingCountryKey({ country: "", city: "Barcelona" })).toBe("spain");
  });

  it("returns null for unknown places", () => {
    expect(resolveTimingCountryKey({ country: "Atlantis" })).toBeNull();
  });
});

describe("calendarDayMatchesRuleWindow", () => {
  it("matches June whole-month window", () => {
    const w: StaticTimingRule["window"] = { startMonth: 6, endMonth: 6 };
    expect(calendarDayMatchesRuleWindow(dayjs("2026-06-15"), w)).toBe(true);
    expect(calendarDayMatchesRuleWindow(dayjs("2026-05-30"), w)).toBe(false);
  });

  it("matches Nov–Feb wrap for Iceland winter", () => {
    const w: StaticTimingRule["window"] = { startMonth: 11, endMonth: 2 };
    expect(calendarDayMatchesRuleWindow(dayjs("2026-12-10"), w)).toBe(true);
    expect(calendarDayMatchesRuleWindow(dayjs("2026-02-05"), w)).toBe(true);
    expect(calendarDayMatchesRuleWindow(dayjs("2026-10-05"), w)).toBe(false);
  });

  it("matches sakura partial window", () => {
    const w: StaticTimingRule["window"] = { startMonth: 3, startDay: 20, endMonth: 4, endDay: 12 };
    expect(calendarDayMatchesRuleWindow(dayjs("2026-04-05"), w)).toBe(true);
    expect(calendarDayMatchesRuleWindow(dayjs("2026-03-19"), w)).toBe(false);
  });
});

describe("analyzeTravelTimingRaw", () => {
  it("flags Japan June rainy season", () => {
    const insights = analyzeTravelTimingRaw({
      country: "Japan",
      dateRange: { start: "2026-06-05", end: "2026-06-12" },
    });
    expect(insights.some((i) => i.type === "weather_risk")).toBe(true);
  });

  it("returns empty for unknown destination", () => {
    expect(
      analyzeTravelTimingRaw({
        country: "Narnia",
        dateRange: { start: "2026-06-05", end: "2026-06-12" },
      }),
    ).toEqual([]);
  });

  it("returns empty when dates missing", () => {
    expect(
      analyzeTravelTimingRaw({
        country: "Japan",
        dateRange: { start: "", end: "" },
      }),
    ).toEqual([]);
  });
});

describe("suggestBetterDates", () => {
  it("proposes shifts with fewer hard hits for Thailand monsoon window", () => {
    const alt = suggestBetterDates({
      country: "Thailand",
      currentDateRange: { start: "2026-08-10", end: "2026-08-16" },
    });
    expect(alt.length).toBeGreaterThan(0);
    expect(alt[0]!.start).not.toBe("2026-08-10");
  });

  it("returns empty when current window is already clean", () => {
    const alt = suggestBetterDates({
      country: "Japan",
      currentDateRange: { start: "2026-05-04", end: "2026-05-10" },
    });
    expect(alt).toEqual([]);
  });
});
