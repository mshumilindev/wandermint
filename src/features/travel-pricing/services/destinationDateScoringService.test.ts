import { describe, expect, it, vi } from "vitest";
import { scoreDestinationDateWindows } from "./destinationDateScoringService";

describe("scoreDestinationDateWindows", () => {
  it("returns non-empty windows", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          time: ["2026-05-01", "2026-05-02", "2026-05-03"],
          temperature_2m_min: [10, 11, 12],
          temperature_2m_max: [18, 19, 20],
          weathercode: [0, 1, 2],
        },
      }),
    });

    const rows = await scoreDestinationDateWindows({
      durationDays: 4,
      horizonDays: 40,
      seasonalMonths: [5],
      latitude: 50.06,
      longitude: 19.94,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
