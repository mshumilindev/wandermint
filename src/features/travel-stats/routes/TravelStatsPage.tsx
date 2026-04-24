import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { Alert, Box, Button, Chip, Grid, MenuItem, TextField, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTravelMemoryStore } from "../../../app/store/useTravelMemoryStore";
import { useUiStore } from "../../../app/store/useUiStore";
import type { TravelMemory } from "../../../entities/travel-memory/model";
import { nowIso } from "../../../services/firebase/timestampMapper";
import { travelStatsService } from "../../../services/travel-memory/travelStatsService";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { LoadingState } from "../../../shared/ui/LoadingState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { createClientId } from "../../../shared/lib/id";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { CountryFlag } from "../../../shared/ui/CountryFlag";
import { LocationAutocompleteField, type LocationOption } from "../../../shared/ui/LocationAutocompleteField";
import { StyleBadge } from "../../../shared/ui/StyleBadge";
import { InteractiveTravelMap } from "../components/InteractiveTravelMap";
import { useTravelMapPoints } from "../hooks/useTravelMapPoints";

const styleOptions: TravelMemory["style"][] = ["mixed", "culture", "food", "nature", "nightlife", "rest"];

interface DraftMemory {
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  datePrecision: TravelMemory["datePrecision"];
  startDate: string;
  endDate: string;
  style: TravelMemory["style"];
  notes: string;
}

const visitBadgeTone = (count: number, maxCount: number): string => {
  if (maxCount <= 1) {
    return "rgba(183, 237, 226, 0.22)";
  }
  const ratio = count / maxCount;
  if (ratio >= 0.85) {
    return "rgba(245, 138, 44, 0.32)";
  }
  if (ratio >= 0.6) {
    return "rgba(55, 216, 188, 0.24)";
  }
  return "rgba(125, 24, 54, 0.24)";
};

const createDraftMemory = (): DraftMemory => ({
  city: "",
  country: "",
  latitude: undefined,
  longitude: undefined,
  datePrecision: "month",
  startDate: dayjs().format("YYYY-MM-DD"),
  endDate: dayjs().format("YYYY-MM-DD"),
  style: "mixed",
  notes: "",
});

const monthValueFromDate = (date: string): string => dayjs(date).isValid() ? dayjs(date).format("YYYY-MM") : "";

const firstDayOfMonth = (monthValue: string): string => /^\d{4}-\d{2}$/.test(monthValue) ? dayjs(`${monthValue}-01`).startOf("month").format("YYYY-MM-DD") : "";

const lastDayOfMonth = (monthValue: string): string => /^\d{4}-\d{2}$/.test(monthValue) ? dayjs(`${monthValue}-01`).endOf("month").format("YYYY-MM-DD") : "";

const StatTile = ({ label, value }: { label: string; value: number | string }): JSX.Element => (
  <GlassPanel sx={{ p: 2, minHeight: 112, display: "grid", alignContent: "space-between" }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h4" color="primary.main">{value}</Typography>
  </GlassPanel>
);

const MemoryCard = ({
  memory,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  memory: TravelMemory;
  onEdit: (memory: TravelMemory) => void;
  onDelete: (memory: TravelMemory) => void;
  editLabel: string;
  deleteLabel: string;
}): JSX.Element => (
  <GlassPanel sx={{ p: 2, display: "grid", gap: 1.1 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "start" }}>
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <CountryFlag country={memory.country} size="1rem" />
          <Typography variant="subtitle1">{memory.city}, {memory.country}</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {memory.datePrecision === "month" ? dayjs(memory.startDate).format("MMM YYYY") : `${memory.startDate} - ${memory.endDate}`}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => onEdit(memory)}>
          {editLabel}
        </Button>
        <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => onDelete(memory)}>
          {deleteLabel}
        </Button>
      </Box>
    </Box>
    <StyleBadge style={memory.style} />
    {memory.notes.trim().length > 0 ? (
      <Typography variant="body2" color="text.secondary">
        {memory.notes}
      </Typography>
    ) : null}
  </GlassPanel>
);

export const TravelStatsPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const ensureMemories = useTravelMemoryStore((state) => state.ensureMemories);
  const saveMemory = useTravelMemoryStore((state) => state.saveMemory);
  const deleteMemory = useTravelMemoryStore((state) => state.deleteMemory);
  const memoriesById = useTravelMemoryStore((state) => state.memoriesById);
  const memoryIds = useTravelMemoryStore((state) => state.memoryIds);
  const meta = useTravelMemoryStore((state) => state.meta);
  const pushToast = useUiStore((state) => state.pushToast);
  const [draft, setDraft] = useState<DraftMemory>(createDraftMemory);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [pendingEditMemoryId, setPendingEditMemoryId] = useState<string | null>(null);
  const [pendingDeleteMemoryId, setPendingDeleteMemoryId] = useState<string | null>(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState<LocationOption | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<LocationOption[]>([]);

  useEffect(() => {
    if (user) {
      void ensureMemories(user.id);
    }
  }, [ensureMemories, user]);

  const memories = useMemo(
    () => memoryIds.map((memoryId) => memoriesById[memoryId]).filter((memory): memory is TravelMemory => Boolean(memory)),
    [memoriesById, memoryIds],
  );
  const stats = useMemo(() => travelStatsService.calculateStats(memories), [memories]);
  const editingMemory = useMemo(() => memories.find((memory) => memory.id === editingMemoryId) ?? null, [editingMemoryId, memories]);
  const pendingEditMemory = useMemo(() => memories.find((memory) => memory.id === pendingEditMemoryId) ?? null, [memories, pendingEditMemoryId]);
  const pendingDeleteMemory = useMemo(() => memories.find((memory) => memory.id === pendingDeleteMemoryId) ?? null, [memories, pendingDeleteMemoryId]);
  const { points, isResolving, unresolvedCount } = useTravelMapPoints(memories);

  const patchDraft = <Key extends keyof DraftMemory>(field: Key, value: DraftMemory[Key]): void => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const patchDatePrecision = (datePrecision: TravelMemory["datePrecision"]): void => {
    setDraft((current) => ({
      ...current,
      datePrecision,
      startDate: datePrecision === "month" ? firstDayOfMonth(monthValueFromDate(current.startDate)) : current.startDate,
      endDate: datePrecision === "month" ? lastDayOfMonth(monthValueFromDate(current.endDate)) : current.endDate,
    }));
  };

  const patchStartMonth = (monthValue: string): void => {
    setDraft((current) => ({ ...current, startDate: firstDayOfMonth(monthValue) }));
  };

  const patchEndMonth = (monthValue: string): void => {
    setDraft((current) => ({ ...current, endDate: lastDayOfMonth(monthValue) }));
  };

  const isDraftValid =
    draft.city.trim().length > 0 &&
    draft.country.trim().length > 0 &&
    dayjs(draft.startDate).isValid() &&
    dayjs(draft.endDate).isValid() &&
    !dayjs(draft.startDate).isAfter(dayjs(draft.endDate));

  const submit = async (): Promise<void> => {
    if (!user || !isDraftValid) {
      setDraftError(t("travelStats.validation.required"));
      return;
    }

    const timestamp = nowIso();
    try {
      const locationsToSave = selectedLocations.length > 0
        ? selectedLocations
        : [{
          city: draft.city.trim(),
          country: draft.country.trim(),
          latitude: draft.latitude,
          longitude: draft.longitude,
          label: draft.city && draft.country ? `${draft.city}, ${draft.country}` : draft.city,
          source: "existing" as const,
        }];

      await Promise.all(locationsToSave.map((location, index) => saveMemory({
        id: editingMemoryId && index === 0 ? editingMemoryId : createClientId("memory"),
        userId: user.id,
        city: location.city.trim(),
        country: location.country.trim(),
        datePrecision: draft.datePrecision,
        startDate: draft.startDate,
        endDate: draft.endDate,
        latitude: location.latitude,
        longitude: location.longitude,
        geoLabel: location.label,
        style: draft.style,
        notes: draft.notes.trim(),
        createdAt: editingMemory?.createdAt ?? timestamp,
        updatedAt: timestamp,
      })));
      pushToast({ tone: "success", message: editingMemoryId ? t("feedback.memoryUpdated") : t("feedback.memorySaved") });
      setDraft(createDraftMemory());
      setSelectedLocations([]);
      setLocationDraft(null);
      setDraftError(null);
      setEditingMemoryId(null);
      setConfirmSaveOpen(false);
    } catch {
      pushToast({ tone: "error", message: t("feedback.memorySaveFailed") });
    }
  };

  const startEditing = (memory: TravelMemory): void => {
    setEditingMemoryId(memory.id);
    setDraft({
        city: memory.city,
        country: memory.country,
        latitude: memory.latitude,
        longitude: memory.longitude,
        datePrecision: memory.datePrecision,
        startDate: memory.startDate,
      endDate: memory.endDate,
      style: memory.style,
      notes: memory.notes,
    });
    setSelectedLocations([{
      label: `${memory.city}, ${memory.country}`,
      city: memory.city,
      country: memory.country,
      latitude: memory.latitude,
      longitude: memory.longitude,
      source: "existing",
    }]);
    setDraftError(null);
  };

  const cancelEditing = (): void => {
    setEditingMemoryId(null);
    setDraft(createDraftMemory());
    setSelectedLocations([]);
    setLocationDraft(null);
    setDraftError(null);
  };

  const removeMemory = async (memory: TravelMemory): Promise<void> => {
    try {
      await deleteMemory(memory.id);
      pushToast({ tone: "success", message: t("feedback.memoryDeleted") });
      if (editingMemoryId === memory.id) {
        cancelEditing();
      }
      setPendingDeleteMemoryId(null);
    } catch {
      pushToast({ tone: "error", message: t("feedback.memoryDeleteFailed") });
    }
  };

  return (
    <>
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("travelStats.title")} subtitle={t("travelStats.subtitle")} />
      <InteractiveTravelMap points={points} stats={stats} isResolving={isResolving} unresolvedCount={unresolvedCount} />
      <Grid container spacing={2}>
        <Grid item xs={6} md={2.4}><StatTile label={t("travelStats.visitedCountries")} value={stats.visitedCountries} /></Grid>
        <Grid item xs={6} md={2.4}><StatTile label={t("travelStats.visitedCities")} value={stats.visitedCities} /></Grid>
        <Grid item xs={6} md={2.4}><StatTile label={t("travelStats.trips")} value={stats.tripsRecorded} /></Grid>
        <Grid item xs={6} md={2.4}><StatTile label={t("travelStats.travelDays")} value={stats.travelDays} /></Grid>
        <Grid item xs={6} md={2.4}><StatTile label={t("travelStats.repeatVisits")} value={stats.repeatVisits} /></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid item xs={12} lg={5}>
          <GlassPanel sx={{ p: 3, display: "grid", gap: 2 }}>
            <Typography variant="h6">{editingMemoryId ? t("travelStats.editTrip") : t("travelStats.addTrip")}</Typography>
            {draftError ? <Alert severity="warning">{draftError}</Alert> : null}
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <LocationAutocompleteField
                  label={`${t("travelStats.city")} / location`}
                  city={draft.city}
                  country={draft.country}
                  latitude={draft.latitude}
                  longitude={draft.longitude}
                  error={draftError !== null && (draft.city.trim().length === 0 || draft.country.trim().length === 0)}
                  helperText={draftError !== null && (draft.city.trim().length === 0 || draft.country.trim().length === 0) ? t("travelStats.validation.locationRequired") : " "}
                  onSelect={(value) =>
                    {
                      setLocationDraft(value);
                      setDraft((current) => ({
                        ...current,
                        city: value?.city ?? "",
                        country: value?.country ?? "",
                        latitude: value?.latitude,
                        longitude: value?.longitude,
                      }));
                    }
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      if (!locationDraft || !locationDraft.city.trim() || !locationDraft.country.trim()) {
                        return;
                      }
                      setSelectedLocations((current) =>
                        current.some((item) => item.city === locationDraft.city && item.country === locationDraft.country)
                          ? current
                          : [...current, locationDraft]);
                      setLocationDraft(null);
                    }}
                  >
                    Add location stop
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Backfill old trip can include multiple cities or specific places.
                  </Typography>
                </Box>
                {selectedLocations.length > 0 ? (
                  <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {selectedLocations.map((location) => (
                      <Chip
                        key={`${location.city}-${location.country}-${location.latitude ?? 0}-${location.longitude ?? 0}`}
                        label={location.label}
                        onDelete={() => setSelectedLocations((current) => current.filter((item) => item !== location))}
                      />
                    ))}
                  </Box>
                ) : null}
              </Grid>
              <Grid item xs={12}>
                <TextField select fullWidth label={t("travelStats.datePrecision")} value={draft.datePrecision} onChange={(event) => patchDatePrecision(event.target.value as TravelMemory["datePrecision"])}>
                  <MenuItem value="month">{t("travelStats.monthOnly")}</MenuItem>
                  <MenuItem value="exact">{t("travelStats.exactDates")}</MenuItem>
                </TextField>
              </Grid>
              {draft.datePrecision === "month" ? (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth type="month" label={t("travelStats.startMonth")} value={monthValueFromDate(draft.startDate)} onChange={(event) => patchStartMonth(event.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth type="month" label={t("travelStats.endMonth")} value={monthValueFromDate(draft.endDate)} onChange={(event) => patchEndMonth(event.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                </>
              ) : (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth type="date" label={t("travelStats.startDate")} value={draft.startDate} onChange={(event) => patchDraft("startDate", event.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth type="date" label={t("travelStats.endDate")} value={draft.endDate} onChange={(event) => patchDraft("endDate", event.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                </>
              )}
              <Grid item xs={12}>
                <TextField select fullWidth label={t("travelStats.style")} value={draft.style} onChange={(event) => patchDraft("style", event.target.value as TravelMemory["style"])}>
                  {styleOptions.map((style) => (
                    <MenuItem key={style} value={style}>{t(`travelStats.styles.${style}`)}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth multiline minRows={3} label={t("travelStats.notes")} value={draft.notes} onChange={(event) => patchDraft("notes", event.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button fullWidth={editingMemoryId === null} sx={{ flex: editingMemoryId ? 1 : undefined }} variant="contained" startIcon={<AddRoundedIcon />} disabled={!isDraftValid} onClick={() => setConfirmSaveOpen(true)}>
                    {editingMemoryId ? t("travelStats.saveChanges") : t("travelStats.addTrip")}
                  </Button>
                  {editingMemoryId ? (
                    <Button variant="outlined" onClick={cancelEditing}>
                      {t("common.cancel")}
                    </Button>
                  ) : null}
                </Box>
              </Grid>
            </Grid>
          </GlassPanel>
        </Grid>
        <Grid item xs={12} lg={7}>
          <GlassPanel sx={{ p: 3, display: "grid", gap: 2, minHeight: 360 }}>
            <Typography variant="h6">{t("travelStats.mostVisited")}</Typography>
            {meta.status === "loading" && memories.length === 0 ? <LoadingState /> : null}
            {memories.length === 0 && meta.status !== "loading" ? <EmptyState title={t("travelStats.empty")} description={t("travelStats.subtitle")} /> : null}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {stats.mostVisited.map((place) => {
                const maxCount = stats.mostVisited[0]?.count ?? 1;
                return (
                  <Chip
                    key={place.label}
                    label={place.label}
                    icon={(
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: "999px",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          fontSize: 11,
                          color: "text.primary",
                          background: visitBadgeTone(place.count, maxCount),
                          border: "1px solid rgba(255,255,255,0.18)",
                        }}
                      >
                        {place.count}
                      </Box>
                    )}
                  />
                );
              })}
            </Box>
            <Typography variant="h6">{t("travelStats.yearly")}</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {stats.yearlyActivity.map((year) => <Chip key={year.label} label={`${year.label}: ${year.count}`} variant="outlined" />)}
            </Box>
            <Typography variant="h6">{t("travelStats.recordedTrips")}</Typography>
            <Box sx={{ display: "grid", gap: 1.25 }}>
              {memories.slice(0, 8).map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onEdit={(nextMemory) => setPendingEditMemoryId(nextMemory.id)}
                  onDelete={(nextMemory) => setPendingDeleteMemoryId(nextMemory.id)}
                  editLabel={t("common.edit")}
                  deleteLabel={t("common.delete")}
                />
              ))}
            </Box>
          </GlassPanel>
        </Grid>
      </Grid>
    </Box>
    <ConfirmActionDialog
      open={Boolean(pendingEditMemory)}
      title={t("prompts.confirmOpenMemoryEditTitle")}
      description={pendingEditMemory ? t("prompts.confirmOpenMemoryEditDescription", { place: `${pendingEditMemory.city}, ${pendingEditMemory.country}` }) : t("prompts.confirmOpenMemoryEditFallback")}
      confirmLabel={t("common.edit")}
      cancelLabel={t("common.cancel")}
      onCancel={() => setPendingEditMemoryId(null)}
      onConfirm={() => {
        if (pendingEditMemory) {
          startEditing(pendingEditMemory);
        }
        setPendingEditMemoryId(null);
      }}
    />
    <ConfirmActionDialog
      open={Boolean(pendingDeleteMemory)}
      title={t("prompts.confirmDeleteMemoryTitle")}
      description={pendingDeleteMemory ? t("prompts.confirmDeleteMemoryDescription", { place: `${pendingDeleteMemory.city}, ${pendingDeleteMemory.country}` }) : t("prompts.confirmDeleteMemoryFallback")}
      impactNote={t("prompts.confirmDeleteMemoryImpact")}
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      tone="danger"
      onCancel={() => setPendingDeleteMemoryId(null)}
      onConfirm={() => pendingDeleteMemory && void removeMemory(pendingDeleteMemory)}
    />
    <ConfirmActionDialog
      open={confirmSaveOpen}
      title={editingMemoryId ? t("prompts.confirmMemoryEditTitle") : t("prompts.confirmMemorySaveTitle")}
      description={editingMemoryId ? t("prompts.confirmMemoryEditDescription") : t("prompts.confirmMemorySaveDescription")}
      confirmLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      onCancel={() => setConfirmSaveOpen(false)}
      onConfirm={() => void submit()}
    />
    </>
  );
};
