import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../services/media/wikimediaImageService", () => ({
  wikimediaImageService: {
    resolveImage: vi.fn(async () => null),
  },
}));

import { clearImagePipelineCacheForTests, peekResolvedImage } from "./imageCache";
import { buildImageCacheKey, resolveUniversalImage } from "./imageResolver";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network disabled in tests");
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("buildImageCacheKey", () => {
  it("changes when tiered URLs change", () => {
    const a = buildImageCacheKey({
      entityId: "e1",
      title: "Museum",
      existingImageUrl: undefined,
      apiImageUrl: undefined,
      providerImageUrl: undefined,
      googlePlacesPhotoUrl: undefined,
    });
    const b = buildImageCacheKey({
      entityId: "e1",
      title: "Museum",
      existingImageUrl: "https://example.com/a.jpg",
      apiImageUrl: undefined,
      providerImageUrl: undefined,
      googlePlacesPhotoUrl: undefined,
    });
    expect(a).not.toBe(b);
  });
});

describe("resolveUniversalImage", () => {
  it("caches by entity id and tier inputs without refetching", async () => {
    clearImagePipelineCacheForTests();
    const existing =
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=200&q=60";
    const input = {
      entityId: "test-entity-cache",
      title: "Offline cache title",
      existingImageUrl: existing,
    };
    const r1 = await resolveUniversalImage(input);
    const r2 = await resolveUniversalImage(input);
    expect(r1.url).toBe(r2.url);
    expect(r1.source).toBe("existing");
    expect(peekResolvedImage(buildImageCacheKey(input))?.url).toBe(r1.url);
  });

  it("falls back to a deterministic curated stock URL when all tiers and Wikimedia are missing", async () => {
    clearImagePipelineCacheForTests();
    const r = await resolveUniversalImage({
      entityId: "no-image-entity",
      title: "Obscure alleyway gallery",
      categoryHint: "museum",
    });
    expect(r.url.length).toBeGreaterThan(10);
    expect(r.url.startsWith("https://")).toBe(true);
    expect(r.source).toBe("unsplash_curated");
  });
});
