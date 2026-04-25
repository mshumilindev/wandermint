import { describe, expect, it, vi } from "vitest";
import { buildTripBudgetBreakdown } from "./tripBudgetService";

describe("buildTripBudgetBreakdown", () => {
  it("does not invent transport totals when proxy is missing", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("frankfurter")) {
        return { ok: true, json: async () => ({ rates: { PLN: 4.2 } }) };
      }
      if (url.includes("worldbank.org")) {
        return {
          ok: true,
          json: async () => [
            {},
            [
              { date: "2023", value: 2.1, indicator: { id: "PA.NUS.PRVT.PP" } },
              { date: "2022", value: 2.0, indicator: { id: "PA.NUS.PRVT.PP" } },
            ],
          ],
        };
      }
      if (url.includes("overpass-api")) {
        return { ok: true, json: async () => ({ elements: [] }) };
      }
      return { ok: false, json: async () => ({}) };
    });

    const b = await buildTripBudgetBreakdown({
      originLabel: "Kraków, Poland",
      originCountryMeta: { iso2: "PL", iso3: "POL", commonName: "Poland" },
      destinationCity: "Lisbon",
      destinationCountry: "Portugal",
      destinationCountryMeta: { iso2: "PT", iso3: "PRT", commonName: "Portugal" },
      destinationLabel: "Lisbon, Portugal",
      startDate: "2026-06-10",
      endDate: "2026-06-14",
      durationDays: 5,
      userCurrency: "PLN",
      userAvgDailySpend: 600,
      foodStyle: "balanced",
    });

    expect(b.categories.transport.confidence).toBe("unavailable");
    expect(b.categories.transport.max).toBe(0);
    expect(b.categories.food.confidence).not.toBe("unavailable");
    expect(b.totalMax).toBeGreaterThan(0);
  });
});
