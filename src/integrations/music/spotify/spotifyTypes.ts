import { z } from "zod";

export const spotifyImageSchema = z.object({
  url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const spotifyArtistSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  genres: z.array(z.string()).optional(),
  popularity: z.number().optional(),
  images: z.array(spotifyImageSchema).optional(),
  external_urls: z.object({ spotify: z.string().optional() }).optional(),
});

export const spotifyTrackArtistSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
});

export const spotifyAlbumSchema = z.object({
  name: z.string().optional(),
  images: z.array(spotifyImageSchema).optional(),
});

export const spotifyTrackSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  artists: z.array(spotifyTrackArtistSchema).optional(),
  album: spotifyAlbumSchema.optional(),
  external_urls: z.object({ spotify: z.string().optional() }).optional(),
});

export const spotifyRecentlyPlayedItemSchema = z.object({
  track: spotifyTrackSchema.optional(),
});

export const spotifyTopArtistsResponseSchema = z.object({
  items: z.array(spotifyArtistSchema).optional(),
});

export const spotifyTopTracksResponseSchema = z.object({
  items: z.array(spotifyTrackSchema).optional(),
});

export const spotifyRecentlyPlayedResponseSchema = z.object({
  items: z.array(spotifyRecentlyPlayedItemSchema).optional(),
});

export const spotifyMeSchema = z.object({
  id: z.string().optional(),
  display_name: z.string().optional(),
});

export type SpotifyArtistParsed = z.infer<typeof spotifyArtistSchema>;
export type SpotifyTrackParsed = z.infer<typeof spotifyTrackSchema>;
export type SpotifyRecentlyPlayedItem = z.infer<typeof spotifyRecentlyPlayedItemSchema>;

/** Normalized for internal use (id + name required). */
export type SpotifyArtist = SpotifyArtistParsed & { id: string; name: string };
export type SpotifyTrack = SpotifyTrackParsed & { id: string; name: string };
