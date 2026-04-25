import { describe, expect, it } from "vitest";
import { generateMusicSuggestionExplanation, interpretMusicTasteProfile } from "./musicAiLayer";
import type { MusicTasteProfile } from "../../../integrations/music/musicTypes";

const minimalProfile = (): MusicTasteProfile => ({
  userId: "u",
  providers: [],
  topArtists: [
    {
      provider: "spotify",
      providerArtistId: "1",
      name: "Radiohead",
      genres: ["alternative rock"],
      score: 120,
      confidence: "high",
      source: "top_artist",
    },
  ],
  topTracks: [],
  topGenres: [{ name: "alternative rock", score: 50, confidence: "medium", sourceProviders: ["spotify"] }],
  scenes: [{ key: "rock", label: "small venues", score: 40, confidence: "medium", derivedFrom: ["alternative rock"] }],
  updatedAt: new Date().toISOString(),
  expiresAt: new Date().toISOString(),
});

describe("musicAiLayer", () => {
  it("interpretMusicTasteProfile returns stable structure", async () => {
    const v = await interpretMusicTasteProfile(minimalProfile(), false);
    expect(v.travelVibe.length).toBeGreaterThan(0);
    expect(v.preferredExperienceTypes.length).toBeGreaterThan(0);
  });

  it("generateMusicSuggestionExplanation includes artist when safe", async () => {
    const line = await generateMusicSuggestionExplanation({
      suggestionTitle: "Prague show",
      matchedArtistName: "Radiohead",
      city: "Prague",
    });
    expect(line.toLowerCase()).toContain("radiohead");
  });
});
