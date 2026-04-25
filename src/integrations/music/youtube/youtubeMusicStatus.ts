import type { YoutubeMusicSupportLevel } from "./youtubeMusicTypes";

export const youtubeMusicSupport = (): { level: YoutubeMusicSupportLevel; message: string } => ({
  level: "limited_coming_later",
  message:
    "YouTube does not offer an official YouTube Music listening-history API comparable to Spotify. Limited playlist-based signals may arrive later via YouTube Data API with explicit OAuth.",
});
