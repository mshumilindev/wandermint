import dayjs from "dayjs";
import type { MusicProviderConnection } from "./musicTypes";
import { musicStorage } from "./musicStorage";
import { musicTokenStorage } from "./musicTokenStorage";
import { fetchSpotifyRecentlyPlayed, fetchSpotifyTopArtists, fetchSpotifyTopTracks } from "./spotify/spotifyApiClient";
import { buildMusicTasteProfile } from "../../services/personalization/music/musicTasteProfileBuilder";
import { MusicIntegrationError, warnMusicDev } from "./musicErrors";

export const syncSpotifyProfileForUser = async (userId: string, accessToken: string): Promise<void> => {
  if (!userId.trim()) {
    return;
  }
  const connecting: MusicProviderConnection = {
    provider: "spotify",
    status: "connecting",
    connectedAt: new Date().toISOString(),
  };
  await musicStorage.saveProviderConnection(userId, connecting);
  try {
    const [topArtists, topTracks, recentlyPlayed] = await Promise.all([
      fetchSpotifyTopArtists(accessToken),
      fetchSpotifyTopTracks(accessToken),
      fetchSpotifyRecentlyPlayed(accessToken).catch(() => []),
    ]);
    const existingProfile = await musicStorage.getProfile(userId);
    const filteredOthers = existingProfile?.providers.filter((p) => p.provider !== "spotify") ?? [];
    const otherProviders: MusicProviderConnection[] =
      filteredOthers.length > 0
        ? filteredOthers
        : [
            { provider: "appleMusic", status: "unsupported" },
            { provider: "youtubeMusic", status: "unsupported" },
          ];
    const spotifyConn: MusicProviderConnection = {
      provider: "spotify",
      status: "connected",
      connectedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      expiresAt: dayjs().add(50, "minute").toISOString(),
    };
    const profile = buildMusicTasteProfile({
      userId,
      providerConnections: [spotifyConn, ...otherProviders],
      providerHarvest: { spotify: { topArtists, topTracks, recentlyPlayed } },
    });
    await musicStorage.saveProfile(userId, profile);
    await musicStorage.saveProviderConnection(userId, spotifyConn);
  } catch (e) {
    const code = e instanceof MusicIntegrationError ? e.code : "provider_unavailable";
    warnMusicDev(code, "spotify");
    await musicStorage.saveProviderConnection(userId, {
      provider: "spotify",
      status: e instanceof MusicIntegrationError && e.code === "provider_unauthorized" ? "expired" : "error",
      errorCode: code,
      errorMessage: e instanceof Error ? e.message : "sync_failed",
    });
    throw e;
  }
};

export const disconnectSpotifyForUser = async (userId: string): Promise<void> => {
  musicTokenStorage.clearSpotifyAccessToken();
  musicTokenStorage.clearPkceVerifier();
  musicTokenStorage.clearPkceState();
  await musicStorage.deleteProviderConnection(userId, "spotify");
  const profile = await musicStorage.getProfile(userId);
  const remaining =
    profile?.providers.filter((p) => p.provider !== "spotify" && p.status === "connected").length ?? 0;
  if (remaining === 0) {
    await musicStorage.deleteProfile(userId);
  }
};
