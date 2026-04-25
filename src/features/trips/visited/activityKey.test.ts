import { describe, expect, it } from "vitest";
import { stableActivityKey } from "./activityKey";
import { block } from "../test/planTestFixtures";

describe("stableActivityKey", () => {
  it("uses block id when present", () => {
    const b = block({ id: "block-abc", title: "A", startTime: "09:00", endTime: "10:00" });
    expect(stableActivityKey("t1", "d1", 0, 0, b)).toBe("t1::d1::block-abc");
  });

  it("is deterministic without block id", () => {
    const b = block({ id: "", title: "Museum", startTime: "10:00", endTime: "11:00" });
    const k1 = stableActivityKey("t1", "d1", 2, 3, b);
    const k2 = stableActivityKey("t1", "d1", 2, 3, b);
    expect(k1).toBe(k2);
    expect(k1).toContain("t1::d1::d2_b3_");
  });

  it("changes when title or time changes", () => {
    const a = block({ id: "", title: "A", startTime: "10:00", endTime: "11:00" });
    const b = block({ id: "", title: "B", startTime: "10:00", endTime: "11:00" });
    expect(stableActivityKey("t", "d", 0, 0, a)).not.toBe(stableActivityKey("t", "d", 0, 0, b));
  });
});
