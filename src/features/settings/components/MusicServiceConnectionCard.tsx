import { Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { MusicProvider, MusicProviderConnection } from "../../../integrations/music/musicTypes";
import type { MusicTasteProfile } from "../../../integrations/music/musicTypes";
import { musicErrorUserMessage, type MusicIntegrationErrorCode } from "../../../integrations/music/musicErrors";
import { isAppleMusicIntegrationConfigured } from "../../../integrations/music/apple/appleMusicAuth";
import { youtubeMusicSupport } from "../../../integrations/music/youtube/youtubeMusicStatus";

export type MusicServiceConnectionCardProps = {
  provider: MusicProvider;
  connection: MusicProviderConnection | null;
  profile: MusicTasteProfile | null;
  busy?: boolean;
  onConnectSpotify?: () => void;
  onSyncSpotify?: () => void;
  onDisconnectSpotify?: () => void;
};

const spotifyPreview = (profile: MusicTasteProfile | null): string[] =>
  (profile?.topArtists ?? [])
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((a) => a.name);

export const MusicServiceConnectionCard = ({
  provider,
  connection,
  profile,
  busy = false,
  onConnectSpotify,
  onSyncSpotify,
  onDisconnectSpotify,
}: MusicServiceConnectionCardProps): JSX.Element => {
  const { t } = useTranslation();
  const status = connection?.status ?? "not_connected";

  if (provider === "appleMusic") {
    const ready = isAppleMusicIntegrationConfigured();
    return (
      <Box sx={{ p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider", display: "grid", gap: 1 }}>
        <Typography variant="subtitle2" fontWeight={800}>
          {t("music.services.appleTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {ready ? t("music.services.appleReadyHint") : t("music.services.appleDisabled")}
        </Typography>
        {!ready ? <Chip size="small" label={t("music.services.comingLater")} /> : null}
      </Box>
    );
  }

  if (provider === "youtubeMusic") {
    const { message } = youtubeMusicSupport();
    return (
      <Box sx={{ p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider", display: "grid", gap: 1 }}>
        <Typography variant="subtitle2" fontWeight={800}>
          {t("music.services.youtubeTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
        <Chip size="small" label={t("music.services.limitedComingLater")} />
      </Box>
    );
  }

  const preview = spotifyPreview(profile);
  const errCode = connection?.errorCode as MusicIntegrationErrorCode | undefined;
  const errLabel = errCode ? musicErrorUserMessage(errCode) : "";

  return (
    <Box sx={{ p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider", display: "grid", gap: 1.25 }}>
      <Typography variant="subtitle2" fontWeight={800}>
        {t("music.services.spotifyTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("music.services.spotifyHint")}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Chip size="small" label={t(`music.status.${status}`)} color={status === "connected" ? "success" : "default"} />
        {busy ? <CircularProgress size={18} /> : null}
      </Stack>
      {status === "connected" && profile?.providers.find((p) => p.provider === "spotify")?.lastSyncedAt ? (
        <Typography variant="caption" color="text.secondary">
          {t("music.services.lastSynced", { date: profile.providers.find((p) => p.provider === "spotify")?.lastSyncedAt ?? "" })}
        </Typography>
      ) : null}
      {preview.length > 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t("music.services.topPreview", { names: preview.join(", ") })}
        </Typography>
      ) : status === "connected" ? (
        <Typography variant="caption" color="text.secondary">
          {t("music.services.emptyPreview")}
        </Typography>
      ) : null}
      {status === "error" || status === "expired" ? (
        <Typography variant="body2" color="warning.main">
          {errLabel || connection?.errorMessage || t("music.services.genericError")}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {status === "not_connected" || status === "error" || status === "expired" ? (
          <Button variant="contained" size="small" disabled={busy} onClick={onConnectSpotify}>
            {status === "not_connected" ? t("music.services.connectSpotify") : t("music.services.reconnectSpotify")}
          </Button>
        ) : null}
        {status === "connected" ? (
          <>
            <Button variant="outlined" size="small" disabled={busy} onClick={onSyncSpotify}>
              {t("music.services.syncNow")}
            </Button>
            <Button variant="text" size="small" color="warning" disabled={busy} onClick={onDisconnectSpotify}>
              {t("music.services.disconnect")}
            </Button>
          </>
        ) : null}
      </Stack>
    </Box>
  );
};
