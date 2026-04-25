import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, TextField } from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "../../../entities/trip/model";
import { intercityTransportService } from "../../../services/travel-intelligence/intercityTransportService";
import { createClientId } from "../../../shared/lib/id";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { shiftTripLikeDateRange } from "../../../services/planning/timing/travelTimingService";
import { LocationAutocompleteField } from "../../../shared/ui/LocationAutocompleteField";
import { TravelTimingWarningBanner } from "./TravelTimingWarningBanner";

interface TripEditPanelProps {
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onSave: (trip: Trip) => Promise<void> | void;
}

export const TripEditPanel = ({ trip, open, onClose, onSave }: TripEditPanelProps): JSX.Element => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Trip>(trip);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingRemoveSegmentId, setPendingRemoveSegmentId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(trip);
      setError(null);
      setIsSaving(false);
      setConfirmSaveOpen(false);
      setPendingRemoveSegmentId(null);
    }
  }, [open, trip]);

  const isValid = useMemo(
    () =>
      draft.title.trim().length > 0 &&
      draft.tripSegments.length > 0 &&
      draft.tripSegments.every(
        (segment) =>
          segment.city.trim().length > 0 &&
          segment.country.trim().length > 0 &&
          dayjs(segment.startDate).isValid() &&
          dayjs(segment.endDate).isValid() &&
          !dayjs(segment.startDate).isAfter(dayjs(segment.endDate)),
      ) &&
      dayjs(draft.dateRange.start).isValid() &&
      dayjs(draft.dateRange.end).isValid() &&
      !dayjs(draft.dateRange.start).isAfter(dayjs(draft.dateRange.end)) &&
      draft.budget.amount > 0 &&
      draft.tripSegments.every(
        (segment) =>
          !dayjs(segment.startDate).isBefore(dayjs(draft.dateRange.start)) &&
          !dayjs(segment.endDate).isAfter(dayjs(draft.dateRange.end)),
      ),
    [draft],
  );

  const patchSegment = (segmentId: string, field: "city" | "country" | "startDate" | "endDate", value: string): void => {
    setDraft((current) => ({
      ...current,
      tripSegments: current.tripSegments.map((segment) => (segment.id === segmentId ? { ...segment, [field]: value } : segment)),
    }));
  };

  const addSegment = (): void => {
    const fallbackDate = draft.tripSegments[draft.tripSegments.length - 1]?.endDate || draft.dateRange.end || draft.dateRange.start || dayjs().format("YYYY-MM-DD");
    setDraft((current) => ({
      ...current,
      tripSegments: [
        ...current.tripSegments,
        {
          id: createClientId("segment"),
          city: "",
          country: "",
          startDate: fallbackDate,
          endDate: fallbackDate,
          hotelInfo: {},
          arrivalTransportNotes: "",
          departureTransportNotes: "",
        },
      ],
    }));
  };

  const removeSegment = (): void => {
    if (!pendingRemoveSegmentId) {
      return;
    }

    setDraft((current) => ({
      ...current,
      tripSegments: current.tripSegments.filter((segment) => segment.id !== pendingRemoveSegmentId),
    }));
    setPendingRemoveSegmentId(null);
  };

  const submit = async (): Promise<void> => {
    if (!isValid) {
      setError(t("editTrip.validation"));
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const orderedSegments = [...draft.tripSegments].sort((left, right) => left.startDate.localeCompare(right.startDate));
      const dateRange = {
        start: orderedSegments[0]?.startDate ?? draft.dateRange.start,
        end: orderedSegments[orderedSegments.length - 1]?.endDate ?? draft.dateRange.end,
      };
      const destination = orderedSegments.map((segment) => segment.city.trim()).filter(Boolean).join(" → ");
      const intercityMoves = await intercityTransportService.createMoves(orderedSegments, draft.budget.currency);
      await onSave({
        ...draft,
        tripSegments: orderedSegments,
        destination,
        dateRange,
        intercityMoves,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch {
      setError(t("feedback.tripSaveFailed"));
    } finally {
      setIsSaving(false);
      setConfirmSaveOpen(false);
    }
  };

  return (
    <>
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t("editTrip.title")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2.5, pt: 1 }}>
        {error ? <Alert severity="warning">{error}</Alert> : null}
        <TravelTimingWarningBanner
          country={draft.tripSegments[0]?.country ?? ""}
          city={draft.tripSegments[0]?.city}
          destinationLabel={draft.destination}
          dateRange={draft.dateRange}
          onApplyDateRange={(range) => {
            setDraft((current) => shiftTripLikeDateRange(current, range));
          }}
        />
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <TextField fullWidth label={t("editTrip.tripTitle")} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="number"
              label={t("wizard.budget")}
              value={draft.budget.amount}
              onChange={(event) => setDraft((current) => ({ ...current, budget: { ...current.budget, amount: Number(event.target.value) } }))}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth type="date" label={t("wizard.start")} value={draft.dateRange.start} onChange={(event) => setDraft((current) => ({ ...current, dateRange: { ...current.dateRange, start: event.target.value } }))} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth type="date" label={t("wizard.end")} value={draft.dateRange.end} onChange={(event) => setDraft((current) => ({ ...current, dateRange: { ...current.dateRange, end: event.target.value } }))} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label={t("wizard.party")} value={draft.preferences.partyComposition} onChange={(event) => setDraft((current) => ({ ...current, preferences: { ...current.preferences, partyComposition: event.target.value as Trip["preferences"]["partyComposition"] } }))}>
              {["solo", "couple", "friends", "family"].map((value) => (
                <MenuItem key={value} value={value}>
                  {t(`wizard.partyOptions.${value}`)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label={t("wizard.wishes")} value={draft.preferences.specialWishes} onChange={(event) => setDraft((current) => ({ ...current, preferences: { ...current.preferences, specialWishes: event.target.value } }))} />
          </Grid>
        </Grid>
        <Box sx={{ display: "grid", gap: 2 }}>
          {draft.tripSegments.map((segment, index) => (
            <Box key={segment.id} sx={{ display: "grid", gap: 1.5, p: 2, borderRadius: 2.5, border: "1px solid var(--wm-glass-border)", background: "rgba(255,255,255,0.03)" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center" }}>
                <Box sx={{ fontWeight: 700 }}>{t("wizard.stopNumber", { count: index + 1 })}</Box>
                {draft.tripSegments.length > 1 ? (
                  <Button color="error" size="small" variant="outlined" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setPendingRemoveSegmentId(segment.id)}>
                    {t("wizard.removeStop")}
                  </Button>
                ) : null}
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} md={8}>
                  <LocationAutocompleteField
                    label={t("wizard.cityCountry")}
                    city={segment.city}
                    country={segment.country}
                    onSelect={(value) => {
                      patchSegment(segment.id, "city", value?.city ?? "");
                      patchSegment(segment.id, "country", value?.country ?? "");
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth type="date" label={t("wizard.start")} value={segment.startDate} onChange={(event) => patchSegment(segment.id, "startDate", event.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth type="date" label={t("wizard.end")} value={segment.endDate} onChange={(event) => patchSegment(segment.id, "endDate", event.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
              </Grid>
            </Box>
          ))}
          <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addSegment}>
            {t("wizard.addCity")}
          </Button>
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
      title={t("prompts.confirmTripEditTitle")}
      description={t("prompts.confirmTripEditDescription")}
      impactNote={t("prompts.confirmTripEditImpact")}
      confirmLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      isPending={isSaving}
      onCancel={() => setConfirmSaveOpen(false)}
      onConfirm={() => void submit()}
    />
    <ConfirmActionDialog
      open={Boolean(pendingRemoveSegmentId)}
      title={t("prompts.confirmRemoveSegmentTitle")}
      description={t("prompts.confirmRemoveSegmentDescription")}
      impactNote={t("prompts.confirmRemoveSegmentImpact")}
      confirmLabel={t("wizard.removeStop")}
      cancelLabel={t("common.cancel")}
      tone="danger"
      onCancel={() => setPendingRemoveSegmentId(null)}
      onConfirm={removeSegment}
    />
    </>
  );
};
