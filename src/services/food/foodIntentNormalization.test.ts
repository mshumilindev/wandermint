import { describe, expect, it } from "vitest";
import { normalizeFoodIntentLabel } from "./foodIntentNormalization";

describe("normalizeFoodIntentLabel", () => {
  it("maps oysters to seafood tags", () => {
    expect(normalizeFoodIntentLabel("oysters")).toEqual(["seafood", "oysters"]);
  });

  it("maps ramen to japanese + ramen", () => {
    expect(normalizeFoodIntentLabel("ramen")).toEqual(["japanese", "ramen"]);
  });

  it("falls back to slug for unknown phrases", () => {
    expect(normalizeFoodIntentLabel("obscure dish xyz")).toEqual(["obscure_dish_xyz"]);
  });
});
