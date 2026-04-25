import { describe, expect, it } from "vitest";
import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";
import { deriveFlickSyncStatuses, scoreFlickSyncLibraryInterest } from "./flickSyncLibrarySignals";

const base = (overrides: Partial<FlickSyncLibraryItem>): FlickSyncLibraryItem => ({
  id: "tmdb_tv_1400",
  provider: "tmdb",
  sourceId: "1400",
  mediaType: "tv",
  title: "Seinfeld",
  ...overrides,
});

describe("deriveFlickSyncStatuses", () => {
  it("maps consumed tv to watched and favourite to following", () => {
    const item = base({ consumed: true, isFavourite: true, mediaType: "tv" });
    expect(deriveFlickSyncStatuses(item).sort()).toEqual(["following", "watched"].sort());
  });

  it("maps consumed game to played", () => {
    const item = base({ consumed: true, mediaType: "game", title: "Hades" });
    expect(deriveFlickSyncStatuses(item)).toContain("played");
    expect(deriveFlickSyncStatuses(item)).not.toContain("watched");
  });

  it("includes wishlist and abandoned alongside other flags", () => {
    const item = base({
      abandoned: true,
      consumed: true,
      isFavourite: true,
      isWishlisted: true,
    });
    const s = deriveFlickSyncStatuses(item);
    expect(new Set(s)).toEqual(new Set(["abandoned", "watched", "following", "wishlist"]));
  });
});

describe("scoreFlickSyncLibraryInterest", () => {
  it("stacks watched and following", () => {
    const item = base({ consumed: true, isFavourite: true });
    expect(scoreFlickSyncLibraryInterest(item)).toBe(5 + 4);
  });

  it("adds consumeCount tiers only when consumed", () => {
    expect(scoreFlickSyncLibraryInterest(base({ consumed: true, consumeCount: 2 }))).toBe(5 + 2);
    expect(scoreFlickSyncLibraryInterest(base({ consumed: true, consumeCount: 3 }))).toBe(5 + 4);
    expect(scoreFlickSyncLibraryInterest(base({ consumed: true, consumeCount: 1 }))).toBe(5);
  });

  it("applies abandoned penalty", () => {
    const item = base({ abandoned: true, consumed: true, isFavourite: true });
    expect(scoreFlickSyncLibraryInterest(item)).toBe(5 + 4 - 6);
  });

  it("does not use externalRating", () => {
    const low = base({ isWishlisted: true, externalRating: 2 });
    const high = base({ isWishlisted: true, externalRating: 10 });
    expect(scoreFlickSyncLibraryInterest(low)).toBe(scoreFlickSyncLibraryInterest(high));
  });
});
