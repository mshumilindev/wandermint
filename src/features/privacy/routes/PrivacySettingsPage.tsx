import { Alert, Box, Button, CircularProgress, FormControlLabel, Switch, Typography } from "@mui/material";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { usePrivacySettingsStore } from "../../../app/store/usePrivacySettingsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { createDefaultPrivacySettings, type PrivacySettings } from "../privacySettings.types";
import { deleteTravelBehaviorProfileForUser, deleteTripReviewsForUser } from "../privacyActions";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";

export const PrivacySettingsPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const settings = usePrivacySettingsStore((state) => state.settings);
  const meta = usePrivacySettingsStore((state) => state.meta);
  const ensurePrivacySettings = usePrivacySettingsStore((state) => state.ensurePrivacySettings);
  const savePrivacySettings = usePrivacySettingsStore((state) => state.savePrivacySettings);
  const pushToast = useUiStore((state) => state.pushToast);

  const [draft, setDraft] = useState<PrivacySettings | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [confirmProfileOpen, setConfirmProfileOpen] = useState(false);
  const [confirmReviewsOpen, setConfirmReviewsOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<"profile" | "reviews" | null>(null);

  useEffect(() => {
    if (user?.id) {
      void ensurePrivacySettings(user.id);
    }
  }, [ensurePrivacySettings, user?.id]);

  useEffect(() => {
    if (user?.id && settings) {
      setDraft(settings);
    }
  }, [settings, user?.id]);

  const loading = Boolean(user) && settings === null && meta.status === "loading";

  const patchDraft = (partial: Partial<Omit<PrivacySettings, "userId" | "updatedAt">>): void => {
    if (!user?.id || !draft) {
      return;
    }
    setDraft({ ...draft, ...partial });
  };

  const submit = async (): Promise<void> => {
    if (!draft || saveBusy) {
      return;
    }
    setSaveBusy(true);
    try {
      await savePrivacySettings(draft);
      pushToast({ tone: "success", message: t("privacy.saveSuccess") });
    } catch {
      pushToast({ tone: "error", message: t("privacy.saveFailed") });
    } finally {
      setSaveBusy(false);
    }
  };

  const runDeleteProfile = async (): Promise<void> => {
    if (!user?.id) {
      return;
    }
    setDeleteBusy("profile");
    try {
      await deleteTravelBehaviorProfileForUser(user.id);
      pushToast({ tone: "success", message: t("privacy.deleteProfileSuccess") });
    } catch {
      pushToast({ tone: "error", message: t("privacy.deleteProfileFailed") });
    } finally {
      setDeleteBusy(null);
      setConfirmProfileOpen(false);
    }
  };

  const runDeleteReviews = async (): Promise<void> => {
    if (!user?.id) {
      return;
    }
    setDeleteBusy("reviews");
    try {
      await deleteTripReviewsForUser(user.id);
      pushToast({ tone: "success", message: t("privacy.deleteReviewsSuccess") });
    } catch {
      pushToast({ tone: "error", message: t("privacy.deleteReviewsFailed") });
    } finally {
      setDeleteBusy(null);
      setConfirmReviewsOpen(false);
    }
  };

  const effectiveDraft = draft ?? (user?.id ? createDefaultPrivacySettings(user.id) : null);

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader
        title={t("privacy.title")}
        subtitle={t("privacy.subtitle")}
        action={
          <Button component={Link} to="/settings" variant="outlined">
            {t("privacy.backToPreferences")}
          </Button>
        }
      />

      {meta.status === "error" && meta.error ? (
        <Alert severity="error">{meta.error}</Alert>
      ) : null}

      <GlassPanel sx={{ p: 3 }}>
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 4, justifyContent: "center" }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              {t("privacy.loading")}
            </Typography>
          </Box>
        ) : effectiveDraft ? (
          <Box sx={{ display: "grid", gap: 2.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("privacy.intro")}
            </Typography>

            <FormControlLabel
              control={<Switch checked={effectiveDraft.allowLocationDuringTrip} onChange={(_, v) => patchDraft({ allowLocationDuringTrip: v })} />}
              label={
                <Box>
                  <Typography variant="subtitle2">{t("privacy.allowLocation")}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {t("privacy.allowLocationHint")}
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={<Switch checked={effectiveDraft.allowBehaviorLearning} onChange={(_, v) => patchDraft({ allowBehaviorLearning: v })} />}
              label={
                <Box>
                  <Typography variant="subtitle2">{t("privacy.allowBehaviorLearning")}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {t("privacy.allowBehaviorLearningHint")}
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={<Switch checked={effectiveDraft.allowPostTripAnalysis} onChange={(_, v) => patchDraft({ allowPostTripAnalysis: v })} />}
              label={
                <Box>
                  <Typography variant="subtitle2">{t("privacy.allowPostTripAnalysis")}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {t("privacy.allowPostTripAnalysisHint")}
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={<Switch checked={effectiveDraft.allowExternalEventSearch} onChange={(_, v) => patchDraft({ allowExternalEventSearch: v })} />}
              label={
                <Box>
                  <Typography variant="subtitle2">{t("privacy.allowExternalEventSearch")}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {t("privacy.allowExternalEventSearchHint")}
                  </Typography>
                </Box>
              }
            />

            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", pt: 1 }}>
              <Button variant="contained" disabled={saveBusy || !draft} onClick={() => void submit()}>
                {saveBusy ? <CircularProgress size={22} color="inherit" /> : t("privacy.save")}
              </Button>
            </Box>
          </Box>
        ) : null}
      </GlassPanel>

      <GlassPanel sx={{ p: 3, borderColor: "rgba(245, 138, 44, 0.35)" }}>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 800 }}>
          {t("privacy.dataControlsTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("privacy.dataControlsSubtitle")}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
          <Button variant="outlined" color="warning" onClick={() => setConfirmProfileOpen(true)}>
            {t("privacy.deleteBehaviorProfile")}
          </Button>
          <Button variant="outlined" color="warning" onClick={() => setConfirmReviewsOpen(true)}>
            {t("privacy.deleteTripReviews")}
          </Button>
        </Box>
      </GlassPanel>

      <ConfirmActionDialog
        open={confirmProfileOpen}
        title={t("privacy.confirmDeleteProfileTitle")}
        description={t("privacy.confirmDeleteProfileBody")}
        confirmLabel={t("privacy.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        isPending={deleteBusy === "profile"}
        onCancel={() => setConfirmProfileOpen(false)}
        onConfirm={() => void runDeleteProfile()}
      />
      <ConfirmActionDialog
        open={confirmReviewsOpen}
        title={t("privacy.confirmDeleteReviewsTitle")}
        description={t("privacy.confirmDeleteReviewsBody")}
        confirmLabel={t("privacy.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        isPending={deleteBusy === "reviews"}
        onCancel={() => setConfirmReviewsOpen(false)}
        onConfirm={() => void runDeleteReviews()}
      />
    </Box>
  );
};
