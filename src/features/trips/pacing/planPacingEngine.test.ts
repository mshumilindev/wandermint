import { describe, expect, it } from "vitest";
import { computePlanPacingState, detectFastCompletionPattern } from "./planPacingEngine";
import { block, dayPlan } from "../test/planTestFixtures";
import { stableActivityKey } from "../visited/activityKey";

const activityKey =
  (tripId: string, dayId: string) =>
  (di: number, bi: number, b: ReturnType<typeof block>): string =>
    stableActivityKey(tripId, dayId, di, bi, b);

describe("computePlanPacingState", () => {
  it("is on_track when visited count matches expected completed for today", () => {
    const b1 = block({ id: "1", title: "A", startTime: "09:00", endTime: "10:00" });
    const b2 = block({ id: "2", title: "B", startTime: "11:00", endTime: "12:00" });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [b1, b2] });
    const ordered = [b1, b2];
    const k = activityKey("t", "d1");
    const now = new Date("2026-04-24T10:30:00.000Z");
    const overlayByKey = { [k(0, 0, b1)]: { visited: true } };
    expect(
      computePlanPacingState({
        day,
        dayIndex: 0,
        orderedBlocks: ordered,
        overlayByKey,
        activityKey: k,
        now,
        timeZone: "UTC",
      }),
    ).toBe("on_track");
  });

  it("is ahead when more visited than expected completed", () => {
    const b1 = block({ id: "1", title: "A", startTime: "09:00", endTime: "10:00" });
    const b2 = block({ id: "2", title: "B", startTime: "11:00", endTime: "12:00" });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [b1, b2] });
    const ordered = [b1, b2];
    const k = activityKey("t", "d1");
    const now = new Date("2026-04-24T10:30:00.000Z");
    const overlayByKey = { [k(0, 0, b1)]: { visited: true }, [k(0, 1, b2)]: { visited: true } };
    expect(
      computePlanPacingState({
        day,
        dayIndex: 0,
        orderedBlocks: ordered,
        overlayByKey,
        activityKey: k,
        now,
        timeZone: "UTC",
      }),
    ).toBe("ahead");
  });

  it("marks behind when first open activity ended +30m and not visited", () => {
    const b1 = block({ id: "1", title: "A", startTime: "08:00", endTime: "09:00" });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [b1] });
    const ordered = [b1];
    const k = activityKey("t", "d1");
    const now = new Date("2026-04-24T10:00:00.000Z");
    expect(
      computePlanPacingState({
        day,
        dayIndex: 0,
        orderedBlocks: ordered,
        overlayByKey: {},
        activityKey: k,
        now,
        timeZone: "UTC",
      }),
    ).toBe("behind");
  });
});

describe("detectFastCompletionPattern", () => {
  it("detects too-fast when two recent visits with low dwell vs planned", () => {
    const b1 = block({ id: "1", title: "A", startTime: "10:30", endTime: "11:30" });
    const b2 = block({ id: "2", title: "B", startTime: "11:45", endTime: "12:45" });
    const day = dayPlan({ id: "d1", date: "2026-04-24", blocks: [b1, b2] });
    const ordered = [b1, b2];
    const k = activityKey("t", "d1");
    const now = new Date("2026-04-24T12:00:00.000Z");
    const overlayByKey = {
      [k(0, 0, b1)]: { visited: true, visitedAt: "2026-04-24T10:38:00.000Z" },
      [k(0, 1, b2)]: { visited: true, visitedAt: "2026-04-24T11:52:00.000Z" },
    };
    const r = detectFastCompletionPattern(day, ordered, overlayByKey, k, 0, now, "UTC");
    expect(r.tooFast).toBe(true);
  });
});
