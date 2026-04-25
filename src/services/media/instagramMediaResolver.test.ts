import { describe, expect, it } from "vitest";
import { isInstagramUrlClientPlausible, normalizeInstagramUrl } from "./instagramMediaResolver";

describe("normalizeInstagramUrl", () => {
  it("adds https when missing", () => {
    expect(normalizeInstagramUrl("www.instagram.com/p/AbC12_-/")).toBe("https://www.instagram.com/p/AbC12_-/");
  });
});

describe("isInstagramUrlClientPlausible", () => {
  it("accepts post and reel paths", () => {
    expect(isInstagramUrlClientPlausible("https://instagram.com/p/XYZ/")).toBe(true);
    expect(isInstagramUrlClientPlausible("https://www.instagram.com/reel/ABC123/")).toBe(true);
  });

  it("rejects stories and highlights", () => {
    expect(isInstagramUrlClientPlausible("https://www.instagram.com/stories/user/123")).toBe(false);
    expect(isInstagramUrlClientPlausible("https://www.instagram.com/highlights/abc/")).toBe(false);
  });
});
