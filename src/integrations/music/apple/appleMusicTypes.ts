/** Apple Music API shapes (subset). Full flow requires developer token + MusicKit user token. */

export type AppleMusicConnectionMode = "placeholder" | "ready";

export type AppleRecentlyPlayedResource = {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    genreNames?: string[];
    artwork?: { url?: string; width?: number; height?: number };
  };
};
