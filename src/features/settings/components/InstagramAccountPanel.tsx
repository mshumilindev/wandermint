import InstagramIcon from "@mui/icons-material/Instagram";
import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { saveInstagramAccessToken } from "../../../services/firebase/instagramIntegration";

interface InstagramAccountPanelProps {
  connected: boolean;
  reconnectNeeded: boolean;
  loading: boolean;
  onConnectionChanged: () => Promise<void>;
}

export const InstagramAccountPanel = ({
  connected,
  reconnectNeeded,
  loading,
  onConnectionChanged,
}: InstagramAccountPanelProps): JSX.Element => {
  const { t } = useTranslation();
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveToken = async (): Promise<void> => {
    setError(null);
    if (tokenDraft.trim().length < 40) {
      setError(t("settings.instagram.tokenTooShort"));
      return;
    }
    setBusy(true);
    try {
      await saveInstagramAccessToken(tokenDraft.trim());
      setTokenDraft("");
      await onConnectionChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.instagram.tokenSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <InstagramIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("settings.instagram.title")}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        {t("settings.instagram.subtitle")}
      </Typography>
      {loading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.5 }}>
          <CircularProgress size={22} aria-busy aria-label={t("settings.instagram.checking")} />
          <Typography variant="body2" color="text.secondary">
            {t("settings.instagram.checking")}
          </Typography>
        </Box>
      ) : null}
      {connected ? (
        <Alert severity={reconnectNeeded ? "warning" : "success"} sx={{ alignItems: "center" }}>
          {reconnectNeeded ? t("settings.instagram.reconnectNeeded") : t("settings.instagram.connected")}
        </Alert>
      ) : (
        <Alert severity="info">{t("settings.instagram.notConnected")}</Alert>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
        {t("settings.instagram.tokenHelp")}
      </Typography>
      <TextField
        type="password"
        autoComplete="off"
        label={t("settings.instagram.tokenLabel")}
        value={tokenDraft}
        onChange={(e) => setTokenDraft(e.target.value)}
        disabled={busy || loading}
        fullWidth
        size="small"
      />
      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : null}
      <Button
        variant="contained"
        disabled={busy || loading || tokenDraft.trim().length < 40}
        onClick={() => void handleSaveToken()}
        sx={{ minWidth: 160 }}
      >
        {busy ? <CircularProgress size={22} color="inherit" aria-busy aria-label={t("settings.instagram.saving")} /> : t("settings.instagram.saveToken")}
      </Button>
    </Box>
  );
};
