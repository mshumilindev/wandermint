import { describe, expect, it } from "vitest";
import { rollupBudgetConfidence } from "./sourceConfidenceService";

describe("rollupBudgetConfidence", () => {
  it("returns low when all unavailable", () => {
    expect(rollupBudgetConfidence(["unavailable", "unavailable"])).toBe("low");
  });

  it("returns high when all high", () => {
    expect(rollupBudgetConfidence(["high", "high"])).toBe("high");
  });

  it("downgrades when any unavailable", () => {
    expect(rollupBudgetConfidence(["high", "unavailable"])).toBe("medium");
  });
});
