import { Box, CircularProgress, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { exchangeSpotifyAuthorizationCode } from "../../../integrations/music/spotify/spotifyAuth";
import { MusicIntegrationError, musicErrorUserMessage } from "../../../integrations/music/musicErrors";
import { musicTokenStorage } from "../../../integrations/music/musicTokenStorage";
import { syncSpotifyProfileForUser } from "../../../integrations/music/musicIntegrationService";

export const SpotifyMusicCallbackPage = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const run = async (): Promise<void> => {
      const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
      const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? `${window.location.origin}/settings/music/spotify/callback`;
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const err = params.get("error");
      if (err === "access_denied") {
        setMessage(musicErrorUserMessage("oauth_cancelled"));
        await navigate({ to: "/settings" });
        return;
      }
      if (err) {
        setMessage(musicErrorUserMessage("provider_unavailable"));
        await navigate({ to: "/settings" });
        return;
      }
      const expected = musicTokenStorage.getPkceState();
      if (!state || !expected || state !== expected) {
        setMessage(musicErrorUserMessage("oauth_state_mismatch"));
        await navigate({ to: "/settings" });
        return;
      }
      const verifier = musicTokenStorage.getPkceVerifier();
      if (!code || !verifier || !clientId) {
        setMessage(musicErrorUserMessage("missing_code_verifier"));
        await navigate({ to: "/settings" });
        return;
      }
      if (!user?.id) {
        setMessage(t("music.callback.signIn"));
        await navigate({ to: "/settings" });
        return;
      }
      try {
        const tokens = await exchangeSpotifyAuthorizationCode({
          clientId,
          redirectUri,
          code,
          codeVerifier: verifier,
        });
        musicTokenStorage.clearPkceVerifier();
        musicTokenStorage.clearPkceState();
        musicTokenStorage.setSpotifyAccessToken(tokens.access_token, true);
        await syncSpotifyProfileForUser(user.id, tokens.access_token);
        await navigate({ to: "/settings" });
      } catch (e) {
        const codeMsg = e instanceof MusicIntegrationError ? musicErrorUserMessage(e.code) : musicErrorUserMessage("token_exchange_failed");
        setMessage(codeMsg);
        await navigate({ to: "/settings" });
      }
    };
    void run();
  }, [navigate, t, user?.id]);

  return (
    <Box sx={{ py: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">
        {message ?? t("music.callback.working")}
      </Typography>
    </Box>
  );
};
