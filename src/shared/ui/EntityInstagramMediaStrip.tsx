import InstagramIcon from "@mui/icons-material/Instagram";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { Box, Button, Chip, Link, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EntityMediaAttachment } from "../../entities/media/model";
import {
  normalizeInstagramUrl,
  resolveInstagramMediaAttachment,
  isInstagramUrlClientPlausible,
} from "../../services/media/instagramMediaResolver";
import { saveInstagramAccessToken } from "../../services/firebase/instagramIntegration";
import { createClientId } from "../lib/id";

const aspectBox = (children: ReactNode): JSX.Element => (
  <Box
    sx={{
      position: "relative",
      width: "100%",
      aspectRatio: "16 / 9",
      borderRadius: 2,
      overflow: "hidden",
      border: "1px solid rgba(183, 237, 226, 0.12)",
      background: "rgba(4, 11, 19, 0.55)",
    }}
  >
    {children}
  </Box>
);

interface EntityInstagramMediaStripProps {
  entityId: string;
  /** Travel memories map to "trip" in the media contract. */
  entityType: EntityMediaAttachment["entityType"];
  attachments: EntityMediaAttachment[];
  titleHint: string;
  locationHint?: string;
  categoryHint?: string;
  instagramConnected?: boolean;
  /**
   * `settingsOnly` — prompt to connect under Settings (no token field here).
   * `inlineToken` — legacy token entry on this surface.
   */
  instagramAuthSurface?: "settingsOnly" | "inlineToken";
  onAttachmentsChange: (next: EntityMediaAttachment[]) => void;
  onInstagramConnected?: () => void;
}

export const EntityInstagramMediaStrip = ({
  entityId,
  entityType,
  attachments,
  titleHint,
  locationHint,
  categoryHint,
  instagramConnected = false,
  instagramAuthSurface = "settingsOnly",
  onAttachmentsChange,
  onInstagramConnected,
}: EntityInstagramMediaStripProps): JSX.Element => {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(
    () =>
      urlInput
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    [urlInput],
  );

  const buildAlt = (caption?: string): string =>
    [caption ?? titleHint, locationHint, categoryHint, t("travelStats.instagram.altSuffix")].filter(Boolean).join(" · ");

  const handleAdd = async (): Promise<void> => {
    setError(null);
    if (lines.length === 0) {
      return;
    }
    const invalid = lines.filter((u) => !isInstagramUrlClientPlausible(u));
    if (invalid.length > 0) {
      setError(t("travelStats.instagram.invalidUrls"));
      return;
    }
    setBusy(true);
    try {
      let next = [...attachments];
      for (const line of lines) {
        const pendingId = createClientId("ig");
        const pending: EntityMediaAttachment = {
          id: pendingId,
          entityId,
          entityType,
          source: "instagram",
          sourceUrl: normalizeInstagramUrl(line),
          fetchStatus: "pending",
        };
        next = [...next, pending];
        onAttachmentsChange(next);
        const resolved = await resolveInstagramMediaAttachment({
          url: line,
          entityId,
          entityType,
        });
        next = next.map((a) => (a.id === pendingId ? resolved : a));
        onAttachmentsChange(next);
      }
      setUrlInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("travelStats.instagram.resolveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveToken = async (): Promise<void> => {
    setError(null);
    if (tokenDraft.trim().length < 40) {
      setError(t("travelStats.instagram.tokenTooShort"));
      return;
    }
    setBusy(true);
    try {
      await saveInstagramAccessToken(tokenDraft.trim());
      setTokenDraft("");
      setConnectOpen(false);
      onInstagramConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("travelStats.instagram.tokenSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (id: string): void => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  return (
    <Stack spacing={1.25} sx={{ width: "100%" }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
        {t("travelStats.instagram.sectionTitle")}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
        {t("travelStats.instagram.sectionHint")}
      </Typography>
      {!instagramConnected ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          <Typography variant="caption" color="warning.main">
            {t("travelStats.instagram.notConnected")}
          </Typography>
          {instagramAuthSurface === "settingsOnly" ? (
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              {t("travelStats.instagram.connectWhereHint")}
            </Typography>
          ) : !connectOpen ? (
            <Button size="small" variant="outlined" onClick={() => setConnectOpen(true)}>
              {t("travelStats.instagram.connectCta")}
            </Button>
          ) : (
            <Box sx={{ display: "grid", gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t("travelStats.instagram.tokenHelp")}
              </Typography>
              <TextField
                size="small"
                type="password"
                autoComplete="off"
                label={t("travelStats.instagram.tokenLabel")}
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                fullWidth
              />
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" variant="contained" disabled={busy} onClick={() => void handleSaveToken()}>
                  {t("travelStats.instagram.saveToken")}
                </Button>
                <Button size="small" color="inherit" onClick={() => setConnectOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      ) : null}
      <TextField
        size="small"
        multiline
        minRows={2}
        label={t("travelStats.instagram.urlsLabel")}
        placeholder={t("travelStats.instagram.urlsPlaceholder")}
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        disabled={busy}
        fullWidth
      />
      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : null}
      <Button size="small" variant="outlined" disabled={busy || lines.length === 0} onClick={() => void handleAdd()}>
        {busy ? t("travelStats.instagram.resolving") : t("travelStats.instagram.addUrls")}
      </Button>

      <Stack spacing={1.5}>
        {attachments.map((att) => {
          const openHref = att.permalink ?? att.sourceUrl;
          const showThumb = att.fetchStatus === "resolved" && Boolean(att.thumbnailUrl ?? att.mediaUrl);
          const failed = att.fetchStatus === "failed";
          const pending = att.fetchStatus === "pending";

          return (
            <Box
              key={att.id}
              sx={{
                borderRadius: 2,
                border: "1px solid rgba(183, 237, 226, 0.12)",
                p: 1.25,
                display: "grid",
                gap: 1,
                background: "rgba(4, 11, 19, 0.42)",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                <Chip size="small" icon={<InstagramIcon />} label={t("travelStats.instagram.badge")} variant="outlined" />
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {att.isCarouselHint ? <Chip size="small" label={t("travelStats.instagram.carousel")} /> : null}
                  <Button size="small" color="inherit" onClick={() => removeAt(att.id)}>
                    {t("travelStats.instagram.remove")}
                  </Button>
                </Box>
              </Box>

              {pending
                ? aspectBox(
                    <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                      <Typography variant="caption" color="text.secondary">
                        {t("travelStats.instagram.resolving")}
                      </Typography>
                    </Box>,
                  )
                : null}

              {showThumb
                ? aspectBox(
                    <Box
                      component="img"
                      src={att.thumbnailUrl ?? att.mediaUrl}
                      alt={buildAlt(att.caption)}
                      loading="lazy"
                      decoding="async"
                      sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />,
                  )
                : null}

              {failed || (!showThumb && !pending)
                ? aspectBox(
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        gap: 1,
                        px: 2,
                        textAlign: "center",
                      }}
                    >
                      <InstagramIcon sx={{ fontSize: 36, opacity: 0.75 }} />
                      <Typography variant="body2" color="text.secondary">
                        {att.errorReason === "instagram_not_connected"
                          ? t("travelStats.instagram.reconnectHint")
                          : t("travelStats.instagram.previewUnavailable")}
                      </Typography>
                      <Button
                        component={Link}
                        href={openHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="small"
                        variant="contained"
                        endIcon={<OpenInNewRoundedIcon />}
                      >
                        {t("travelStats.instagram.openOnInstagram")}
                      </Button>
                    </Box>,
                  )
                : null}

              {att.caption && att.fetchStatus === "resolved" ? (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                  {att.caption}
                </Typography>
              ) : null}

              {att.fetchStatus === "resolved" ? (
                <Link href={openHref} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ wordBreak: "break-all" }}>
                  {openHref}
                </Link>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
};
