import { describe, expect, it } from "vitest";
import {
  cooldownKeyFor,
  getSkipCandidates,
  getUnifiedPlanSuggestion,
  insertionForwardOk,
  suggestionFingerprint,
} from "./planSuggestionEngine";
import { block, dayPlan } from "../test/planTestFixtures";
import { stableActivityKey } from "../visited/activityKey";
import { emptyTripPlanOverlay } from "../visited/planOverlayModel";

const p = (lat: number, lon: number, name: string) =>
  ({
    provider: "t",
    name,
    capturedAt: "x",
    latitude: lat,
    longitude: lon,
  }) as const;

describe("insertionForwardOk", () => {
  it("rejects candidate farther from next than from current", () => {
    const current = block({
      id: "c",
      title: "C",
      startTime: "10:00",
      endTime: "11:00",
      place: p(0, 0, "A"),
    });
    const next = block({
      id: "n",
      title: "N",
      startTime: "12:00",
      endTime: "13:00",
      place: p(0, 1, "B"),
    });
    const behind = { latitude: 0, longitude: -0.1 };
    expect(insertionForwardOk(current, next, behind)).toBe(false);
  });

  it("accepts candidate between current and next along forward direction", () => {
    const current = block({
      id: "c",
      title: "C",
      startTime: "10:00",
      endTime: "11:00",
      place: p(0, 0, "A"),
    });
    const next = block({
      id: "n",
      title: "N",
      startTime: "12:00",
      endTime: "13:00",
      place: p(0, 2, "B"),
    });
    const mid = { latitude: 0, longitude: 1.1 };
    expect(insertionForwardOk(current, next, mid)).toBe(true);
  });
});

describe("getSkipCandidates", () => {
  it("never picks first or last block", () => {
    const b0 = block({
      id: "0",
      title: "First",
      startTime: "08:00",
      endTime: "09:00",
      priority: "optional",
      place: p(1, 1, "F"),
    });
    const b1 = block({
      id: "1",
      title: "Mid",
      startTime: "10:00",
      endTime: "10:30",
      priority: "optional",
      category: "cafe",
      place: p(1, 1.01, "M"),
    });
    const b2 = block({
      id: "2",
      title: "Last",
      startTime: "12:00",
      endTime: "13:00",
      priority: "optional",
      place: p(1, 1.02, "L"),
    });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [b0, b1, b2] });
    const ordered = [b0, b1, b2];
    const k = (di: number, bi: number, b: (typeof ordered)[number]) => stableActivityKey("t", "d1", di, bi, b);
    const pick = getSkipCandidates(day, ordered, {}, k, 0);
    expect(pick?.block.id).toBe("1");
  });
});

describe("getUnifiedPlanSuggestion", () => {
  it("returns visit before skip when visit is available", () => {
    const bVisit = block({
      id: "v",
      title: "Here",
      startTime: "12:00",
      endTime: "13:00",
      place: p(48.85, 2.35, "Here"),
    });
    const bMid = block({
      id: "m",
      title: "Mid",
      startTime: "14:00",
      endTime: "14:30",
      priority: "optional",
      category: "cafe",
      place: p(48.86, 2.36, "Mid"),
    });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [bVisit, bMid] });
    const ordered = [bVisit, bMid];
    const k = (di: number, bi: number, b: (typeof ordered)[number]) => stableActivityKey("trip", "d1", di, bi, b);
    const now = new Date("2026-04-24T12:30:00.000Z");
    const overlay = emptyTripPlanOverlay();
    const s = getUnifiedPlanSuggestion({
      tripId: "trip",
      day,
      dayIndex: 0,
      orderedBlocks: ordered,
      overlay,
      overlayByKey: {},
      activityKey: k,
      now,
      timeZone: "UTC",
    });
    expect(s?.kind).toBe("visit_prompt");
  });

  it("does not repeat same visit suggestion after cooldown", () => {
    const bVisit = block({
      id: "v",
      title: "Here",
      startTime: "12:00",
      endTime: "13:00",
      place: p(48.85, 2.35, "Here"),
    });
    const bMid = block({
      id: "m",
      title: "Mid",
      startTime: "14:00",
      endTime: "14:30",
      priority: "optional",
      category: "cafe",
      place: p(48.86, 2.36, "Mid"),
    });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [bVisit, bMid] });
    const ordered = [bVisit, bMid];
    const k = (di: number, bi: number, b: (typeof ordered)[number]) => stableActivityKey("trip", "d1", di, bi, b);
    const key = k(0, 0, bVisit);
    const now = new Date("2026-04-24T12:30:00.000Z");
    const overlay = {
      ...emptyTripPlanOverlay(),
      cooldownUntil: { [cooldownKeyFor("visit_prompt", key)]: now.getTime() + 60 * 60 * 1000 },
    };
    const s = getUnifiedPlanSuggestion({
      tripId: "trip",
      day,
      dayIndex: 0,
      orderedBlocks: ordered,
      overlay,
      overlayByKey: {},
      activityKey: k,
      now,
      timeZone: "UTC",
    });
    expect(s?.kind === "visit_prompt").toBe(false);
  });

  it("returns stable null for identical inputs (idempotent)", () => {
    const b1 = block({ id: "1", title: "A", startTime: "09:00", endTime: "10:00", place: p(1, 1, "A") });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [b1] });
    const ordered = [b1];
    const k = (di: number, bi: number, b: (typeof ordered)[number]) => stableActivityKey("trip", "d1", di, bi, b);
    const now = new Date("2026-04-24T10:30:00.000Z");
    const overlay = emptyTripPlanOverlay();
    const input = {
      tripId: "trip",
      day,
      dayIndex: 0,
      orderedBlocks: ordered,
      overlay,
      overlayByKey: {} as Record<string, undefined>,
      activityKey: k,
      now,
      timeZone: "UTC",
    };
    const a = getUnifiedPlanSuggestion(input);
    const b = getUnifiedPlanSuggestion(input);
    expect(a).toEqual(b);
  });

  it("treats dismissed skip same as hidden", () => {
    const b0 = block({
      id: "0",
      title: "First",
      startTime: "06:00",
      endTime: "07:00",
      place: p(1, 1, "F"),
    });
    const b1 = block({
      id: "1",
      title: "Skip me",
      startTime: "08:00",
      endTime: "08:30",
      priority: "optional",
      category: "cafe",
      place: p(1, 1.01, "M"),
    });
    const b2 = block({
      id: "2",
      title: "Last",
      startTime: "20:00",
      endTime: "21:00",
      place: p(1, 1.02, "L"),
    });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [b0, b1, b2] });
    const ordered = [b0, b1, b2];
    const k = (di: number, bi: number, b: (typeof ordered)[number]) => stableActivityKey("trip", "d1", di, bi, b);
    const skipKey = k(0, 1, b1);
    const fp = suggestionFingerprint("skip_prompt", skipKey);
    const now = new Date("2026-04-24T10:00:00.000Z");
    const overlay = { ...emptyTripPlanOverlay(), dismissed: { [fp]: new Date().toISOString() } };
    const s = getUnifiedPlanSuggestion({
      tripId: "trip",
      day,
      dayIndex: 0,
      orderedBlocks: ordered,
      overlay,
      overlayByKey: {},
      activityKey: k,
      now,
      timeZone: "UTC",
    });
    expect(s?.kind === "skip_prompt").toBe(false);
  });
});
