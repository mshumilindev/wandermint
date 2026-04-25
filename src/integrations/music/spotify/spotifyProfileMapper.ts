import type { ExternalMusicImage } from "../musicTypes";
import type { SpotifyArtist, SpotifyTrack } from "./spotifyTypes";

const sortedImages = (images: ExternalMusicImage[] | undefined): ExternalMusicImage[] => {
  if (!Array.isArray(images)) {
    return [];
  }
  return [...images]
    .filter((i) => typeof i.url === "string" && i.url.length > 0)
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
};

export const pickSpotifyImageUrl = (images: SpotifyArtist["images"]): string | undefined => {
  const arr = sortedImages(images as ExternalMusicImage[] | undefined);
  return arr[0]?.url;
};

export const spotifyGenres = (artist: SpotifyArtist): string[] =>
  Array.isArray(artist.genres) ? artist.genres.map((g) => g.trim().toLowerCase()).filter(Boolean) : [];

export const spotifyTrackArtistNames = (track: SpotifyTrack): string[] => {
  const artists = Array.isArray(track.artists) ? track.artists : [];
  return artists.map((a) => (typeof a.name === "string" ? a.name.trim() : "")).filter(Boolean);
};
