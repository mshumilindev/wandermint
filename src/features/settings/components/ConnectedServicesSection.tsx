import { Alert, Box, Button, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { beginSpotifyPkceLogin } from "../../../integrations/music/spotify/spotifyAuth";
import { disconnectSpotifyForUser, syncSpotifyProfileForUser } from "../../../integrations/music/musicIntegrationService";
import { musicStorage } from "../../../integrations/music/musicStorage";
import { musicTokenStorage } from "../../../integrations/music/musicTokenStorage";
import type { MusicPersonalizationSettings, MusicProviderConnection, MusicTasteProfile } from "../../../integrations/music/musicTypes";
import { defaultMusicPersonalizationSettings } from "../../../integrations/music/musicTypes";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MusicServiceConnectionCard } from "./MusicServiceConnectionCard";

export type ConnectedServicesSectionProps = {
  userId: string | undefined;
};

export const ConnectedServicesSection = ({ userId }: ConnectedServicesSectionProps): JSX.Element => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<MusicTasteProfile | null>(null);
  const [settings, setSettings] = useState<MusicPersonalizationSettings>(defaultMusicPersonalizationSettings());
  const [spotify, setSpotify] = useState<MusicProviderConnection | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? `${window.location.origin}/settings/music/spotify/callback`;

  const reload = useCallback(async (): Promise<void> => {
    if (!userId?.trim()) {
      setProfile(null);
      setSpotify(null);
      setSettings(defaultMusicPersonalizationSettings());
      return;
    }
    const [p, s, sp] = await Promise.all([
      musicStorage.getProfile(userId),
      musicStorage.getSettings(userId),
      musicStorage.getProviderConnection(userId, "spotify"),
    ]);
    setProfile(p);
    setSettings(s);
    setSpotify(sp ?? { provider: "spotify", status: "not_connected" });
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchSettings = async (next: Partial<MusicPersonalizationSettings>): Promise<void> => {
    if (!userId?.trim()) {
      return;
    }
    const merged = { ...settings, ...next };
    setSettings(merged);
    await musicStorage.saveSettings(userId, merged);
  };

  const handleConnectSpotify = async (): Promise<void> => {
    setBusy(true);
    try {
      await beginSpotifyPkceLogin(redirectUri);
    } catch {
      setBusy(false);
    }
  };

  const handleSyncSpotify = async (): Promise<void> => {
    if (!userId?.trim()) {
      return;
    }
    const token = musicTokenStorage.getSpotifyAccessToken();
    if (!token) {
      await handleConnectSpotify();
      return;
    }
    setBusy(true);
    try {
      await syncSpotifyProfileForUser(userId, token);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectSpotify = async (): Promise<void> => {
    if (!userId?.trim()) {
      return;
    }
    setBusy(true);
    try {
      await disconnectSpotifyForUser(userId);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassPanel sx={{ p: 3, display: "grid", gap: 2 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {t("music.settings.sectionTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("music.settings.sectionSubtitle")}
        </Typography>
      </Box>
      <Alert
        severity={spotify?.status === "connected" ? "success" : "info"}
        action={
          <Button
            size="small"
            variant={spotify?.status === "connected" ? "outlined" : "contained"}
            disabled={busy}
            onClick={() => void handleConnectSpotify()}
          >
            {spotify?.status === "connected" ? t("music.settings.reconnectCta") : t("music.settings.connectCta")}
          </Button>
        }
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("music.settings.authTitle")}
        </Typography>
        <Typography variant="body2">
          {spotify?.status === "connected" ? t("music.settings.authConnected") : t("music.settings.authDisconnected")}
        </Typography>
      </Alert>
      <Stack spacing={1}>
        <FormControlLabel
          control={
            <Switch
              checked={settings.useMusicTastePersonalization}
              onChange={(e) => void patchSettings({ useMusicTastePersonalization: e.target.checked })}
              disabled={!userId}
            />
          }
          label={t("music.settings.togglePersonalization")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.allowConcertSuggestions}
              onChange={(e) => void patchSettings({ allowConcertSuggestions: e.target.checked })}
              disabled={!userId || !settings.useMusicTastePersonalization}
            />
          }
          label={t("music.settings.toggleConcerts")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.allowVenueSuggestions}
              onChange={(e) => void patchSettings({ allowVenueSuggestions: e.target.checked })}
              disabled={!userId || !settings.useMusicTastePersonalization}
            />
          }
          label={t("music.settings.toggleVenues")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.allowAiMusicInterpretation}
              onChange={(e) => void patchSettings({ allowAiMusicInterpretation: e.target.checked })}
              disabled={!userId || !settings.useMusicTastePersonalization}
            />
          }
          label={t("music.settings.toggleAiInterpretation")}
        />
      </Stack>
      <Stack spacing={1.5}>
        <MusicServiceConnectionCard
          provider="spotify"
          connection={spotify}
          profile={profile}
          busy={busy}
          onConnectSpotify={() => void handleConnectSpotify()}
          onSyncSpotify={() => void handleSyncSpotify()}
          onDisconnectSpotify={() => void handleDisconnectSpotify()}
        />
        <MusicServiceConnectionCard provider="appleMusic" connection={null} profile={profile} />
        <MusicServiceConnectionCard provider="youtubeMusic" connection={null} profile={profile} />
      </Stack>
    </GlassPanel>
  );
};
