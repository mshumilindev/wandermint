import { describe, expect, it } from "vitest";
import { buildMusicTasteProfile } from "./musicTasteProfileBuilder";

describe("buildMusicTasteProfile", () => {
  it("handles empty Spotify harvest safely", () => {
    const profile = buildMusicTasteProfile({
      userId: "u1",
      providerConnections: [{ provider: "spotify", status: "connected" }],
      providerHarvest: { spotify: { topArtists: [], topTracks: [], recentlyPlayed: [] } },
    });
    expect(profile.topArtists).toEqual([]);
    expect(profile.topTracks).toEqual([]);
    expect(profile.userId).toBe("u1");
  });
});
