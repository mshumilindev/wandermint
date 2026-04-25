import { MusicIntegrationError, warnMusicDev } from "../musicErrors";
import {
  spotifyMeSchema,
  spotifyRecentlyPlayedResponseSchema,
  spotifyTopArtistsResponseSchema,
  spotifyTopTracksResponseSchema,
  type SpotifyArtist,
  type SpotifyRecentlyPlayedItem,
  type SpotifyTrack,
} from "./spotifyTypes";

const SPOTIFY_API = "https://api.spotify.com/v1";

const safeArtistsArray = (raw: unknown): SpotifyArtist[] => {
  const parsed = spotifyTopArtistsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return [];
  }
  const items = Array.isArray(parsed.data.items) ? parsed.data.items : [];
  const out: SpotifyArtist[] = [];
  for (const a of items) {
    const id = typeof a.id === "string" ? a.id : "";
    const name = typeof a.name === "string" ? a.name : "";
    if (!id.trim() || !name.trim()) {
      continue;
    }
    out.push({ ...a, id, name });
  }
  return out;
};

const safeTracksArray = (raw: unknown): SpotifyTrack[] => {
  const parsed = spotifyTopTracksResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return [];
  }
  const items = Array.isArray(parsed.data.items) ? parsed.data.items : [];
  const out: SpotifyTrack[] = [];
  for (const t of items) {
    const id = typeof t.id === "string" ? t.id : "";
    const name = typeof t.name === "string" ? t.name : "";
    if (!id.trim() || !name.trim()) {
      continue;
    }
    out.push({ ...t, id, name });
  }
  return out;
};

const spotifyFetch = async (accessToken: string, path: string): Promise<Response> => {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new MusicIntegrationError("provider_unauthorized", "Spotify session expired", "spotify");
  }
  if (res.status === 403) {
    throw new MusicIntegrationError("provider_forbidden", "Spotify forbidden or missing scope", "spotify");
  }
  if (res.status === 429) {
    const retry = res.headers.get("Retry-After");
    warnMusicDev("provider_rate_limited", "spotify", retry ?? undefined);
    throw new MusicIntegrationError("provider_rate_limited", "Spotify rate limited", "spotify");
  }
  if (!res.ok) {
    warnMusicDev("provider_unavailable", "spotify", String(res.status));
    throw new MusicIntegrationError("provider_unavailable", "Spotify API error", "spotify");
  }
  return res;
};

export const fetchSpotifyTopArtists = async (accessToken: string): Promise<SpotifyArtist[]> => {
  const res = await spotifyFetch(accessToken, "/me/top/artists?time_range=medium_term&limit=20");
  const json: unknown = await res.json().catch(() => null);
  return safeArtistsArray(json);
};

export const fetchSpotifyTopTracks = async (accessToken: string): Promise<SpotifyTrack[]> => {
  const res = await spotifyFetch(accessToken, "/me/top/tracks?time_range=medium_term&limit=20");
  const json: unknown = await res.json().catch(() => null);
  return safeTracksArray(json);
};

export const fetchSpotifyRecentlyPlayed = async (accessToken: string): Promise<SpotifyRecentlyPlayedItem[]> => {
  try {
    const res = await spotifyFetch(accessToken, "/me/player/recently-played?limit=20");
    const json: unknown = await res.json().catch(() => null);
    const parsed = spotifyRecentlyPlayedResponseSchema.safeParse(json);
    if (!parsed.success) {
      return [];
    }
    return Array.isArray(parsed.data.items) ? parsed.data.items : [];
  } catch (e) {
    if (e instanceof MusicIntegrationError && e.code === "provider_forbidden") {
      return [];
    }
    throw e;
  }
};

export const fetchSpotifyMe = async (accessToken: string): Promise<{ id: string; displayName?: string } | null> => {
  try {
    const res = await spotifyFetch(accessToken, "/me");
    const json: unknown = await res.json().catch(() => null);
    const parsed = spotifyMeSchema.safeParse(json);
    if (!parsed.success || !parsed.data.id) {
      return null;
    }
    return { id: parsed.data.id, displayName: parsed.data.display_name };
  } catch {
    return null;
  }
};
