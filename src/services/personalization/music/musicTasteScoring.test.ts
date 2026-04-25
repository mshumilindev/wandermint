import { describe, expect, it } from "vitest";
import { rankActivityWithMusicTaste } from "./musicTasteScoring";

describe("rankActivityWithMusicTaste", () => {
  it("returns 0 when signals null", () => {
    expect(rankActivityWithMusicTaste({ name: "Radiohead concert" }, null)).toBe(0);
  });

  it("caps boost at 0.2", () => {
    const boost = rankActivityWithMusicTaste(
      { name: "Radiohead live in Prague", tags: ["radiohead", "indie rock"] },
      {
        topArtists: ["Radiohead"],
        topGenres: ["indie rock", "alternative rock", "electronica"],
        scenes: ["small venues · record shops · indie districts"],
        confidence: "high",
      },
    );
    expect(boost).toBeLessThanOrEqual(0.2);
  });
});
