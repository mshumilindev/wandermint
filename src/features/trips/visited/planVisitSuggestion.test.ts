import { describe, expect, it } from "vitest";
import { matchVisitTimingRole, getVisitSuggestion } from "./planVisitSuggestion";
import { block, dayPlan } from "../test/planTestFixtures";
import { stableActivityKey } from "./activityKey";

const place = {
  provider: "t",
  name: "Cafe",
  capturedAt: "2026-01-01",
  latitude: 48.8566,
  longitude: 2.3522,
} as const;

describe("matchVisitTimingRole", () => {
  const day = dayPlan({
    id: "day1",
    date: "2026-04-24",
    blocks: [],
  });

  it("returns null when calendar day differs from plan day in timezone", () => {
    const b = block({
      id: "1",
      title: "X",
      startTime: "10:00",
      endTime: "11:00",
      place: { ...place, name: "X" },
    });
    const now = new Date("2026-04-23T10:30:00.000Z");
    expect(matchVisitTimingRole(day, b, now, "UTC")).toBeNull();
  });

  it("classifies active window (-15m / +30m)", () => {
    const b = block({
      id: "1",
      title: "X",
      startTime: "12:00",
      endTime: "13:00",
      place: { ...place, name: "X" },
    });
    const now = new Date("2026-04-24T12:30:00.000Z");
    expect(matchVisitTimingRole(day, b, now, "UTC")).toBe("active");
  });

  it("classifies next when start within 60 minutes", () => {
    const b = block({
      id: "1",
      title: "Soon",
      startTime: "14:00",
      endTime: "15:00",
      place: { ...place, name: "Soon" },
    });
    const now = new Date("2026-04-24T13:30:00.000Z");
    expect(matchVisitTimingRole(day, b, now, "UTC")).toBe("next");
  });

  it("classifies recent when ended within 90 minutes", () => {
    const b = block({
      id: "1",
      title: "Past",
      startTime: "10:00",
      endTime: "11:00",
      place: { ...place, name: "Past" },
    });
    const now = new Date("2026-04-24T11:45:00.000Z");
    expect(matchVisitTimingRole(day, b, now, "UTC")).toBe("recent");
  });

  it("returns null for blocks without coordinates", () => {
    const b = block({
      id: "1",
      title: "Vague",
      startTime: "12:00",
      endTime: "13:00",
      place: { provider: "t", name: "Only name", capturedAt: "x" },
    });
    const now = new Date("2026-04-24T12:30:00.000Z");
    expect(matchVisitTimingRole(day, b, now, "UTC")).toBeNull();
  });
});

describe("getVisitSuggestion", () => {
  it("prefers active over next when both exist", () => {
    const activeB = block({
      id: "a",
      title: "Now",
      startTime: "12:00",
      endTime: "13:00",
      place: { ...place, name: "Now" },
    });
    const nextB = block({
      id: "n",
      title: "Later",
      startTime: "14:00",
      endTime: "15:00",
      place: { ...place, name: "Later" },
    });
    const day = dayPlan({ id: "day1", date: "2026-04-24", blocks: [nextB, activeB] });
    const ordered = [nextB, activeB];
    const keyFn = (di: number, bi: number, b: (typeof ordered)[number]) => stableActivityKey("trip", day.id, di, bi, b);
    const now = new Date("2026-04-24T12:30:00.000Z");
    const v = getVisitSuggestion(day, ordered, {}, keyFn, 0, now, "UTC");
    expect(v?.role).toBe("active");
    expect(v?.block.id).toBe("a");
  });

  it("returns null when already visited", () => {
    const b = block({
      id: "a",
      title: "Now",
      startTime: "12:00",
      endTime: "13:00",
      place: { ...place, name: "Now" },
    });
    const day = dayPlan({ id: "day1", date: "2026-04-24", blocks: [b] });
    const ordered = [b];
    const keyFn = (di: number, bi: number, bl: (typeof ordered)[number]) => stableActivityKey("trip", day.id, di, bi, bl);
    const k = keyFn(0, 0, b);
    const now = new Date("2026-04-24T12:30:00.000Z");
    expect(getVisitSuggestion(day, ordered, { [k]: { visited: true } }, keyFn, 0, now, "UTC")).toBeNull();
  });
});
