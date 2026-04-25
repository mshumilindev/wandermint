import { describe, expect, it } from "vitest";
import { findMusicEventsForTrip } from "./musicEventDiscoveryService";
import type { MusicTasteProfile } from "../../integrations/music/musicTypes";

describe("findMusicEventsForTrip", () => {
  it("returns empty when no API key", async () => {
    const profile: MusicTasteProfile = {
      userId: "u",
      providers: [],
      topArtists: [
        {
          provider: "spotify",
          providerArtistId: "a",
          name: "Artist",
          genres: [],
          score: 90,
          confidence: "high",
          source: "top_artist",
        },
      ],
      topTracks: [],
      topGenres: [],
      scenes: [],
      updatedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    };
    const out = await findMusicEventsForTrip({
      trip: {
        destination: "Prague",
        tripSegments: [{ id: "s1", city: "Prague", country: "CZ", startDate: "2026-06-01", endDate: "2026-06-05", hotelInfo: {} }],
        dateRange: { start: "2026-06-01", end: "2026-06-05" },
      },
      profile,
    });
    expect(out).toEqual([]);
  });
});
