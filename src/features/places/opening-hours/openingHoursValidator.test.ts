import { describe, expect, it } from "vitest";
import type { OpeningHours } from "./openingHours.types";
import { resolveOpeningHoursFromLabel } from "./openingHoursResolver";
import { toPlanSlotOpeningHoursCheck, validatePlanWindowAgainstOpeningHours } from "./openingHoursValidator";

describe("validatePlanWindowAgainstOpeningHours", () => {
  it("returns unknown when opening hours are missing", () => {
    const r = validatePlanWindowAgainstOpeningHours(null, "2025-06-02T10:00:00.000Z", "2025-06-02T11:00:00.000Z");
    expect(r.status).toBe("unknown");
    expect(toPlanSlotOpeningHoursCheck(r).slotInvalid).toBe(false);
  });

  it("returns open when the window fits parsed hours", () => {
    const hours = resolveOpeningHoursFromLabel("Mo 09:00-17:00", "UTC");
    expect(hours).not.toBeNull();
    const r = validatePlanWindowAgainstOpeningHours(hours, "2025-06-02T10:00:00.000Z", "2025-06-02T11:00:00.000Z");
    expect(r.status).toBe("open");
  });

  it("returns closed when the window is outside hours", () => {
    const hours = resolveOpeningHoursFromLabel("Mo 09:00-12:00", "UTC");
    expect(hours).not.toBeNull();
    const r = validatePlanWindowAgainstOpeningHours(hours, "2025-06-02T13:00:00.000Z", "2025-06-02T14:00:00.000Z");
    expect(r.status).toBe("closed");
    expect(toPlanSlotOpeningHoursCheck(r).slotInvalid).toBe(true);
    expect(r.nextOpenTime).toBeDefined();
  });

  it("returns closed on a weekday when hours only cover Monday", () => {
    const hours = resolveOpeningHoursFromLabel("Mo 09:00-17:00", "UTC");
    expect(hours).not.toBeNull();
    const r = validatePlanWindowAgainstOpeningHours(hours, "2025-06-03T10:00:00.000Z", "2025-06-03T11:00:00.000Z");
    expect(r.status).toBe("closed");
    expect(toPlanSlotOpeningHoursCheck(r).slotInvalid).toBe(true);
  });

  it("treats special closure dates as closed even when the label would otherwise be open", () => {
    const hours: OpeningHours = {
      timezone: "UTC",
      sourceLabel: "24/7",
      periods: [],
      specialClosures: [{ date: "2025-06-02", reason: "Holiday" }],
    };
    const r = validatePlanWindowAgainstOpeningHours(hours, "2025-06-02T10:00:00.000Z", "2025-06-02T11:00:00.000Z");
    expect(r.status).toBe("closed");
    expect(r.reason).toContain("Holiday");
  });
});
