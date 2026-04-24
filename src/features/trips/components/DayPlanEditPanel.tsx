import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, TextField } from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DayPlan } from "../../../entities/day-plan/model";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";

const dayAdjustmentOptions = [
  "as_planned",
  "late_start",
  "low_energy",
  "sick_day",
  "stay_in_day",
  "weather_reset",
  "travel_delay",
  "early_finish",
] as const;

interface DayPlanEditPanelProps {
  day: DayPlan;
  open: boolean;
  onClose: () => void;
  onSave: (day: DayPlan) => Promise<void> | void;
}

export const DayPlanEditPanel = ({ day, open, onClose, onSave }: DayPlanEditPanelProps): JSX.Element => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DayPlan>(day);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(day);
      setError(null);
      setIsSaving(false);
      setConfirmSaveOpen(false);
    }
  }, [day, open]);

  const isValid = useMemo(
    () =>
      draft.theme.trim().length > 0 &&
      draft.blocks.every((block) => block.title.trim().length > 0 && dayjs(`2026-01-01T${block.startTime}`).isValid() && dayjs(`2026-01-01T${block.endTime}`).isValid()),
    [draft],
  );

  const patchBlock = (blockId: string, field: "title" | "description" | "startTime" | "endTime", value: string): void => {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, [field]: value } : block)),
    }));
  };

  const applyAdjustmentPreset = (state: NonNullable<DayPlan["adjustment"]>["state"]): void => {
    const updatedAt = new Date().toISOString();
    if (state === "as_planned") {
      setDraft((current) => ({ ...current, adjustment: { state, updatedAt } }));
      return;
    }

    if (state === "sick_day" || state === "stay_in_day") {
      setDraft((current) => ({
        ...current,
        theme: state === "sick_day" ? t("editDay.adjustments.sick_day") : t("editDay.adjustments.stay_in_day"),
        completionStatus: "needs_review",
        adjustment: { state, updatedAt, note: current.adjustment?.note ?? "" },
        blocks: current.blocks.map((block, index) =>
          index === 0
            ? {
                ...block,
                title: state === "sick_day" ? t("editDay.homeRecoveryTitle") : t("editDay.stayInTitle"),
                description: state === "sick_day" ? t("editDay.homeRecoveryDescription") : t("editDay.stayInDescription"),
                type: "rest",
                category: "rest",
                startTime: "09:00",
                endTime: "21:00",
              }
            : { ...block, completionStatus: block.locked ? block.completionStatus : "skipped" },
        ),
      }));
      return;
    }

    setDraft((current) => ({
      ...current,
      completionStatus: state === "early_finish" ? "partially_done" : current.completionStatus,
      adjustment: { state, updatedAt, note: current.adjustment?.note ?? "" },
    }));
  };

  const submit = async (): Promise<void> => {
    if (!isValid) {
      setError(t("editDay.validation"));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch {
      setError(t("feedback.daySaveFailed"));
    } finally {
      setIsSaving(false);
      setConfirmSaveOpen(false);
    }
  };

  return (
    <>
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t("editDay.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2.5, pt: 1 }}>
        {error ? <Alert severity="warning">{error}</Alert> : null}
        <TextField fullWidth label={t("editDay.theme")} value={draft.theme} onChange={(event) => setDraft((current) => ({ ...current, theme: event.target.value }))} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label={t("editDay.dayAdjustment")}
              value={draft.adjustment?.state ?? "as_planned"}
              onChange={(event) => applyAdjustmentPreset(event.target.value as NonNullable<DayPlan["adjustment"]>["state"])}
            >
              {dayAdjustmentOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {t(`editDay.adjustments.${option}`)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label={t("editDay.adjustmentNote")}
              value={draft.adjustment?.note ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  adjustment: {
                    state: current.adjustment?.state ?? "as_planned",
                    updatedAt: new Date().toISOString(),
                    note: event.target.value,
                  },
                }))
              }
            />
          </Grid>
        </Grid>
        <Box sx={{ display: "grid", gap: 2 }}>
          {draft.blocks.map((block) => (
            <Box key={block.id} sx={{ display: "grid", gap: 1.5, p: 2, borderRadius: 2.5, border: "1px solid var(--wm-glass-border)", background: "rgba(255,255,255,0.03)" }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label={t("editDay.blockTitle")} value={block.title} onChange={(event) => patchBlock(block.id, "title", event.target.value)} />
                </Grid>
                <Grid item xs={6} md={3}>
                  <TextField fullWidth type="time" label={t("editDay.startTime")} value={block.startTime} onChange={(event) => patchBlock(block.id, "startTime", event.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={6} md={3}>
                  <TextField fullWidth type="time" label={t("editDay.endTime")} value={block.endTime} onChange={(event) => patchBlock(block.id, "endTime", event.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline minRows={2} label={t("editDay.description")} value={block.description} onChange={(event) => patchBlock(block.id, "description", event.target.value)} />
                </Grid>
              </Grid>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!isValid || isSaving} onClick={() => setConfirmSaveOpen(true)}>
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
    <ConfirmActionDialog
      open={confirmSaveOpen}
      title={t("prompts.confirmDayEditTitle")}
      description={t("prompts.confirmDayEditDescription")}
      impactNote={t("prompts.confirmDayEditImpact")}
      confirmLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      isPending={isSaving}
      onCancel={() => setConfirmSaveOpen(false)}
      onConfirm={() => void submit()}
    />
    </>
  );
};
