import { describe, expect, it } from "vitest";
import { pickSpotifyImageUrl, spotifyGenres } from "./spotifyProfileMapper";
import type { SpotifyArtist } from "./spotifyTypes";

describe("spotifyProfileMapper", () => {
  it("returns undefined when images missing", () => {
    expect(pickSpotifyImageUrl(undefined)).toBeUndefined();
  });

  it("picks largest image by pixel area", () => {
    const artist: SpotifyArtist = {
      id: "a",
      name: "A",
      images: [
        { url: "https://small", width: 10, height: 10 },
        { url: "https://large", width: 100, height: 100 },
      ],
    };
    expect(pickSpotifyImageUrl(artist.images)).toBe("https://large");
  });

  it("treats missing genres as empty array", () => {
    const artist: SpotifyArtist = { id: "x", name: "X" };
    expect(spotifyGenres(artist)).toEqual([]);
  });
});
