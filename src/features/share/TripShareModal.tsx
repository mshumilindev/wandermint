import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../app/store/useUiStore";
import type { CreateTripShareInput, TripShare } from "./share.types";
import { shareRepository } from "./shareRepository";

export type TripShareModalProps = {
  open: boolean;
  onClose: () => void;
  ownerUserId: string;
  tripId: string;
};

const defaultCreateInput = (): CreateTripShareInput => ({
  includeLiveStatus: true,
  includeDocuments: false,
  includeCosts: false,
  expiresAt: null,
});

export const TripShareModal = ({ open, onClose, ownerUserId, tripId }: TripShareModalProps): JSX.Element | null => {
  const { t } = useTranslation();
  const pushToast = useUiStore((s) => s.pushToast);
  const [shares, setShares] = useState<TripShare[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<CreateTripShareInput>(defaultCreateInput);

  const reload = useCallback(async (): Promise<void> => {
    const rows = await shareRepository.listSharesForTripOwner(ownerUserId, tripId);
    setShares(rows);
  }, [ownerUserId, tripId]);

  useEffect(() => {
    if (!open || !ownerUserId.trim() || !tripId.trim()) {
      return;
    }
    setDraft(defaultCreateInput());
    void reload();
  }, [open, ownerUserId, tripId, reload]);

  const shareUrl = (token: string): string => {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/share/trip/${encodeURIComponent(token)}`;
    }
    return `/share/trip/${encodeURIComponent(token)}`;
  };

  const copyLink = async (token: string): Promise<void> => {
    const url = shareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ message: t("share.linkCopied"), tone: "success" });
    } catch {
      pushToast({ message: url, tone: "info" });
    }
  };

  const handleCreate = async (): Promise<void> => {
    setBusy(true);
    try {
      const created = await shareRepository.createShare(ownerUserId, tripId, draft);
      await reload();
      await copyLink(created.token);
    } catch {
      pushToast({ message: t("share.saveFailed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (shareId: string): Promise<void> => {
    setBusy(true);
    try {
      await shareRepository.revokeShare(ownerUserId, tripId, shareId);
      await reload();
      pushToast({ message: t("share.revoked"), tone: "info" });
    } catch {
      pushToast({ message: t("share.saveFailed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async (shareId: string): Promise<void> => {
    setBusy(true);
    try {
      const prev = shares.find((s) => s.id === shareId);
      const input: CreateTripShareInput = prev
        ? {
            includeLiveStatus: prev.includeLiveStatus,
            includeDocuments: prev.includeDocuments,
            includeCosts: prev.includeCosts,
            expiresAt: prev.expiresAt ?? null,
          }
        : draft;
      const next = await shareRepository.regenerateShare(ownerUserId, tripId, shareId, input);
      await reload();
      await copyLink(next.token);
    } catch {
      pushToast({ message: t("share.saveFailed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const activeShares = shares.filter((s) => !s.revokedAt);

  if (!ownerUserId.trim() || !tripId.trim()) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="trip-share-dialog-title">
      <DialogTitle id="trip-share-dialog-title" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, pr: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <LinkRoundedIcon color="primary" />
          <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>
            {t("share.modalTitle")}
          </Typography>
        </Box>
        <IconButton aria-label={t("share.closeModal")} onClick={onClose} size="small">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t("share.panelHint")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("share.readOnlyLinkHint")}
        </Typography>
        <FormGroup sx={{ gap: 0.5 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.includeLiveStatus}
                onChange={(e) => setDraft((d) => ({ ...d, includeLiveStatus: e.target.checked }))}
                disabled={busy}
              />
            }
            label={t("share.optLiveStatus")}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.includeDocuments}
                onChange={(e) => setDraft((d) => ({ ...d, includeDocuments: e.target.checked }))}
                disabled={busy}
              />
            }
            label={t("share.optDocuments")}
          />
          <FormControlLabel
            control={
              <Checkbox checked={draft.includeCosts} onChange={(e) => setDraft((d) => ({ ...d, includeCosts: e.target.checked }))} disabled={busy} />
            }
            label={t("share.optCosts")}
          />
        </FormGroup>
        <Button variant="contained" disabled={busy} onClick={() => void handleCreate()}>
          {t("share.createLink")}
        </Button>
        {activeShares.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("share.noActiveLinks")}
          </Typography>
        ) : (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {activeShares.map((s) => (
              <Box
                key={s.id}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  display: "grid",
                  gap: 1,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {t("share.createdAt", { at: s.createdAt })}
                  {s.expiresAt ? ` · ${t("share.expiresAt", { at: s.expiresAt })}` : ""}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("share.flagsSummary", {
                    live: s.includeLiveStatus ? t("share.flagOn") : t("share.flagOff"),
                    docs: s.includeDocuments ? t("share.flagOn") : t("share.flagOff"),
                    costs: s.includeCosts ? t("share.flagOn") : t("share.flagOff"),
                  })}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  <Button size="small" variant="outlined" startIcon={<ContentCopyRoundedIcon />} disabled={busy} onClick={() => void copyLink(s.token)}>
                    {t("share.copyLink")}
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<RefreshRoundedIcon />} disabled={busy} onClick={() => void handleRegenerate(s.id)}>
                    {t("share.regenerate")}
                  </Button>
                  <Button size="small" color="error" variant="text" startIcon={<BlockRoundedIcon />} disabled={busy} onClick={() => void handleRevoke(s.id)}>
                    {t("share.revoke")}
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="text" onClick={onClose}>
          {t("share.closeModal")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
