import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { Alert, Box, Button, Chip, Grid, MenuItem, TextField, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTravelMemoryStore } from "../../../app/store/useTravelMemoryStore";
import { useUiStore } from "../../../app/store/useUiStore";
import type { MemoryAnchorEvent, TravelMemory } from "../../../entities/travel-memory/model";
import { nowIso } from "../../../services/firebase/timestampMapper";
import { travelStatsService } from "../../../services/travel-memory/travelStatsService";
import { useInstagramConnectionStatus } from "../../../hooks/useInstagramConnectionStatus";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { TravelStatsInsightsPanelSkeleton } from "../../../shared/ui/skeletons/TravelStatsInsightsPanelSkeleton";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { formatTravelMemoryRange } from "../../../shared/lib/formatTravelMemoryRange";
import { createClientId } from "../../../shared/lib/id";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { CountryFlag } from "../../../shared/ui/CountryFlag";
import { LocationAutocompleteField, type LocationOption } from "../../../shared/ui/LocationAutocompleteField";
import { StyleBadge } from "../../../shared/ui/StyleBadge";
import { TravelStyleSelect } from "../../../shared/ui/TravelStyleSelect";
import type { TravelStyle } from "../../../theme/travelStyleConfig";
import { InteractiveTravelMap } from "../components/InteractiveTravelMap";
import { MemoryAnchorEventLookupPanel } from "../components/MemoryAnchorEventLookupPanel";
import { TravelMemoryDetailDrawer } from "../components/TravelMemoryDetailDrawer";
import { useTravelMapPoints } from "../hooks/useTravelMapPoints";
import type { TravelMapPoint } from "../services/travelMapService";

interface DraftMemory {
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  datePrecision: TravelMemory["datePrecision"];
  startDate: string;
  endDate: string;
  style: TravelStyle;
  notes: string;
  anchorEvents: MemoryAnchorEvent[];
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

const EMPTY_ANCHOR_FIELD_LOCKS = new Set<string>();

const emptyAnchorEvent = (): MemoryAnchorEvent => ({
  id: createClientId("ev"),
  title: "",
  artistName: "",
  eventDate: "",
  city: "",
  country: "",
  venue: "",
});

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
  anchorEvents: [],
});

const monthValueFromDate = (date: string): string => dayjs(date).isValid() ? dayjs(date).format("YYYY-MM") : "";

const firstDayOfMonth = (monthValue: string): string => /^\d{4}-\d{2}$/.test(monthValue) ? dayjs(`${monthValue}-01`).startOf("month").format("YYYY-MM-DD") : "";

const lastDayOfMonth = (monthValue: string): string => /^\d{4}-\d{2}$/.test(monthValue) ? dayjs(`${monthValue}-01`).endOf("month").format("YYYY-MM-DD") : "";

const collectMemoryDraftIssues = (draft: DraftMemory, t: ReturnType<typeof useTranslation>["t"]): string[] => {
  const messages: string[] = [];
  if (!draft.city.trim() || !draft.country.trim()) {
    messages.push(t("travelStats.validation.locationRequired"));
  }
  if (!dayjs(draft.startDate).isValid() || !dayjs(draft.endDate).isValid()) {
    messages.push(t("travelStats.validation.datesInvalid"));
  } else if (dayjs(draft.startDate).isAfter(dayjs(draft.endDate))) {
    messages.push(t("travelStats.validation.startAfterEnd"));
  }
  return messages;
};

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
  onOpenDetails,
  editLabel,
  deleteLabel,
  dateLabel,
}: {
  memory: TravelMemory;
  onEdit: (memory: TravelMemory) => void;
  onDelete: (memory: TravelMemory) => void;
  onOpenDetails?: (memory: TravelMemory) => void;
  editLabel: string;
  deleteLabel: string;
  dateLabel: string;
}): JSX.Element => (
  <GlassPanel sx={{ p: 2, display: "grid", gap: 1.1 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "start" }}>
      <Box
        onClick={() => onOpenDetails?.(memory)}
        onKeyDown={(event) => {
          if (!onOpenDetails) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenDetails(memory);
          }
        }}
        role={onOpenDetails ? "button" : undefined}
        tabIndex={onOpenDetails ? 0 : undefined}
        sx={{
          flex: 1,
          minWidth: 0,
          cursor: onOpenDetails ? "pointer" : "default",
          borderRadius: 1,
          outline: "none",
          "&:focus-visible": onOpenDetails
            ? { boxShadow: "0 0 0 2px rgba(33, 220, 195, 0.45)" }
            : undefined,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <CountryFlag country={memory.country} size="1rem" />
          <Typography variant="subtitle1">{memory.city}, {memory.country}</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {dateLabel}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
        <Button size="small" variant="outlined" onClick={(event) => { event.stopPropagation(); onEdit(memory); }}>
          {editLabel}
        </Button>
        <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineRoundedIcon />} onClick={(event) => { event.stopPropagation(); onDelete(memory); }}>
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
  const { connected: instagramConnected, refresh: refreshInstagram } = useInstagramConnectionStatus(user?.id);
  const ensureMemories = useTravelMemoryStore((state) => state.ensureMemories);
  const saveMemory = useTravelMemoryStore((state) => state.saveMemory);
  const deleteMemory = useTravelMemoryStore((state) => state.deleteMemory);
  const memoriesById = useTravelMemoryStore((state) => state.memoriesById);
  const memoryIds = useTravelMemoryStore((state) => state.memoryIds);
  const meta = useTravelMemoryStore((state) => state.meta);
  const pushToast = useUiStore((state) => state.pushToast);
  const [draft, setDraft] = useState<DraftMemory>(createDraftMemory);
  const [anchorFieldLocks, setAnchorFieldLocks] = useState<Record<string, Set<string>>>({});
  const [validationHints, setValidationHints] = useState<string | null>(null);
  const [listDrawer, setListDrawer] = useState<{ memory: TravelMemory; point: TravelMapPoint } | null>(null);
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

  const handlePersistDrawerMemory = async (next: TravelMemory): Promise<void> => {
    try {
      await saveMemory(next);
    } catch {
      pushToast({ tone: "error", message: t("feedback.memorySaveFailed") });
    }
  };

  const memories = useMemo(
    () => memoryIds.map((memoryId) => memoriesById[memoryId]).filter((memory): memory is TravelMemory => Boolean(memory)),
    [memoriesById, memoryIds],
  );
  const listDrawerMemory = useMemo(() => {
    if (!listDrawer) {
      return null;
    }
    return memories.find((item) => item.id === listDrawer.memory.id) ?? listDrawer.memory;
  }, [listDrawer, memories]);
  const stats = useMemo(() => travelStatsService.calculateStats(memories), [memories]);
  const editingMemory = useMemo(() => memories.find((memory) => memory.id === editingMemoryId) ?? null, [editingMemoryId, memories]);
  const pendingEditMemory = useMemo(() => memories.find((memory) => memory.id === pendingEditMemoryId) ?? null, [memories, pendingEditMemoryId]);
  const pendingDeleteMemory = useMemo(() => memories.find((memory) => memory.id === pendingDeleteMemoryId) ?? null, [memories, pendingDeleteMemoryId]);
  const { points, isResolving, unresolvedCount } = useTravelMapPoints(memories);

  const buildPointForMemory = (memory: TravelMemory): TravelMapPoint => {
    const fromMap = points.find((point) => point.memories.some((item) => item.id === memory.id));
    if (fromMap) {
      return fromMap;
    }
    const related = memories.filter((item) => item.city === memory.city && item.country === memory.country);
    return {
      id: `list-${memory.city}-${memory.country}-${memory.id}`,
      city: memory.city,
      country: memory.country,
      label: `${memory.city}, ${memory.country}`,
      latitude: memory.latitude ?? 0,
      longitude: memory.longitude ?? 0,
      visitCount: related.length,
      memories: [...related].sort((left, right) => left.startDate.localeCompare(right.startDate)),
    };
  };

  const patchDraft = <Key extends keyof DraftMemory>(field: Key, value: DraftMemory[Key]): void => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const touchAnchorField = (anchorId: string, field: keyof MemoryAnchorEvent | string): void => {
    setAnchorFieldLocks((prev) => {
      const next = { ...prev };
      const set = new Set(next[anchorId] ?? []);
      set.add(field as string);
      next[anchorId] = set;
      return next;
    });
  };

  const patchAnchorEvent = (id: string, patch: Partial<MemoryAnchorEvent>): void => {
    setDraft((current) => ({
      ...current,
      anchorEvents: current.anchorEvents.map((event) => (event.id === id ? { ...event, ...patch } : event)),
    }));
  };

  const addAnchorEvent = (): void => {
    setDraft((current) => ({
      ...current,
      anchorEvents: [
        ...current.anchorEvents,
        { ...emptyAnchorEvent(), city: current.city.trim(), country: current.country.trim() },
      ],
    }));
  };

  const removeAnchorEvent = (id: string): void => {
    setAnchorFieldLocks((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDraft((current) => ({
      ...current,
      anchorEvents: current.anchorEvents.filter((event) => event.id !== id),
    }));
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

  useEffect(() => {
    if (isDraftValid) {
      setValidationHints(null);
    }
  }, [isDraftValid]);

  const openSaveFlow = (): void => {
    if (!isDraftValid) {
      setValidationHints(collectMemoryDraftIssues(draft, t).join("\n\n"));
      return;
    }
    setValidationHints(null);
    setConfirmSaveOpen(true);
  };

  const submit = async (): Promise<void> => {
    if (!user || !isDraftValid) {
      setValidationHints(t("travelStats.validation.required"));
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

      const anchorEventsForSave = draft.anchorEvents
        .filter((event) => event.title.trim().length > 0 && event.eventDate.trim().length > 0)
        .map((event) => ({
          ...event,
          title: event.title.trim(),
          eventDate: event.eventDate.trim(),
          city: event.city.trim(),
          country: event.country.trim(),
          venue: event.venue?.trim() || undefined,
        }));

      await Promise.all(
        locationsToSave.map((location, index) => {
          const resolvedEvents = anchorEventsForSave.map((event) => ({
            ...event,
            city: event.city || location.city.trim(),
            country: event.country || location.country.trim(),
          }));

          return saveMemory({
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
            anchorEvents: resolvedEvents,
            createdAt: editingMemory?.createdAt ?? timestamp,
            updatedAt: timestamp,
          });
        }),
      );
      pushToast({ tone: "success", message: editingMemoryId ? t("feedback.memoryUpdated") : t("feedback.memorySaved") });
      setDraft(createDraftMemory());
      setAnchorFieldLocks({});
      setSelectedLocations([]);
      setLocationDraft(null);
      setValidationHints(null);
      setEditingMemoryId(null);
      setConfirmSaveOpen(false);
    } catch {
      pushToast({ tone: "error", message: t("feedback.memorySaveFailed") });
    }
  };

  const startEditing = (memory: TravelMemory): void => {
    setEditingMemoryId(memory.id);
    setAnchorFieldLocks({});
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
      anchorEvents: memory.anchorEvents?.map((event) => ({ ...event })) ?? [],
    });
    setSelectedLocations([{
      label: `${memory.city}, ${memory.country}`,
      city: memory.city,
      country: memory.country,
      latitude: memory.latitude,
      longitude: memory.longitude,
      source: "existing",
    }]);
    setValidationHints(null);
  };

  const cancelEditing = (): void => {
    setEditingMemoryId(null);
    setDraft(createDraftMemory());
    setAnchorFieldLocks({});
    setSelectedLocations([]);
    setLocationDraft(null);
    setValidationHints(null);
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
      <InteractiveTravelMap
        points={points}
        stats={stats}
        isResolving={isResolving}
        unresolvedCount={unresolvedCount}
        onPersistTravelMemory={handlePersistDrawerMemory}
        instagramConnected={instagramConnected}
        onInstagramConnected={() => void refreshInstagram()}
      />
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
            {validationHints ? (
              <Alert severity="warning" sx={{ whiteSpace: "pre-line" }}>
                {validationHints}
              </Alert>
            ) : null}
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Box sx={{ display: "grid", gap: 1 }}>
                  <LocationAutocompleteField
                    label={`${t("travelStats.city")} / location`}
                    city={draft.city}
                    country={draft.country}
                    latitude={draft.latitude}
                    longitude={draft.longitude}
                    error={Boolean(validationHints) && (draft.city.trim().length === 0 || draft.country.trim().length === 0)}
                    helperText={
                      Boolean(validationHints) && (draft.city.trim().length === 0 || draft.country.trim().length === 0)
                        ? t("travelStats.validation.locationRequired")
                        : undefined
                    }
                    onSelect={(value) => {
                      setLocationDraft(value);
                      setDraft((current) => ({
                        ...current,
                        city: value?.city ?? "",
                        country: value?.country ?? "",
                        latitude: value?.latitude,
                        longitude: value?.longitude,
                      }));
                    }}
                  />
                  <Button
                    variant="outlined"
                    sx={{ justifySelf: "start" }}
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
                  {selectedLocations.length > 0 ? (
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {selectedLocations.map((location) => (
                        <Chip
                          key={`${location.city}-${location.country}-${location.latitude ?? 0}-${location.longitude ?? 0}`}
                          label={location.label}
                          onDelete={() => setSelectedLocations((current) => current.filter((item) => item !== location))}
                        />
                      ))}
                    </Box>
                  ) : null}
                </Box>
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
                <TravelStyleSelect
                  label={t("travelStats.style")}
                  value={draft.style}
                  onChange={(next) => patchDraft("style", next)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth multiline minRows={3} label={t("travelStats.notes")} value={draft.notes} onChange={(event) => patchDraft("notes", event.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                  <Typography variant="subtitle2">{t("travelStats.anchorEventsSection")}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("travelStats.anchorEventsHint")}
                  </Typography>
                </Box>
              </Grid>
              {draft.anchorEvents.map((event) => (
                <Grid item xs={12} key={event.id}>
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      border: "1px solid rgba(183, 237, 226, 0.14)",
                      background: "rgba(4, 12, 18, 0.35)",
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography variant="caption" color="text.secondary">
                        {t("travelStats.anchorEventsCardLabel")}
                      </Typography>
                      <Button size="small" color="error" variant="text" onClick={() => removeAnchorEvent(event.id)}>
                        {t("travelStats.anchorEventsRemove")}
                      </Button>
                    </Box>
                    <TextField
                      fullWidth
                      required
                      label={t("travelStats.anchorEventsTitle")}
                      value={event.title}
                      onChange={(e) => {
                        touchAnchorField(event.id, "title");
                        patchAnchorEvent(event.id, { title: e.target.value });
                      }}
                    />
                    <TextField
                      fullWidth
                      label={t("travelStats.anchorEventsArtist")}
                      value={event.artistName ?? ""}
                      onChange={(e) => {
                        touchAnchorField(event.id, "artistName");
                        patchAnchorEvent(event.id, { artistName: e.target.value });
                      }}
                    />
                    <TextField
                      fullWidth
                      type="date"
                      label={t("travelStats.anchorEventsDate")}
                      value={event.eventDate}
                      onChange={(e) => {
                        touchAnchorField(event.id, "eventDate");
                        patchAnchorEvent(event.id, { eventDate: e.target.value });
                      }}
                      InputLabelProps={{ shrink: true }}
                    />
                    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                      <TextField
                        fullWidth
                        label={t("travelStats.anchorEventsCity")}
                        value={event.city}
                        onChange={(e) => {
                          touchAnchorField(event.id, "city");
                          patchAnchorEvent(event.id, { city: e.target.value });
                        }}
                      />
                      <TextField
                        fullWidth
                        label={t("travelStats.anchorEventsCountry")}
                        value={event.country}
                        onChange={(e) => {
                          touchAnchorField(event.id, "country");
                          patchAnchorEvent(event.id, { country: e.target.value });
                        }}
                      />
                    </Box>
                    <TextField
                      fullWidth
                      label={t("travelStats.anchorEventsVenue")}
                      value={event.venue ?? ""}
                      onChange={(e) => {
                        touchAnchorField(event.id, "venue");
                        patchAnchorEvent(event.id, { venue: e.target.value });
                      }}
                    />
                    <MemoryAnchorEventLookupPanel
                      anchor={event}
                      locks={anchorFieldLocks[event.id] ?? EMPTY_ANCHOR_FIELD_LOCKS}
                      memoryDatePrecision={draft.datePrecision}
                      memoryStartDate={draft.startDate}
                      memoryEndDate={draft.endDate}
                      memoryCity={draft.city}
                      memoryCountry={draft.country}
                      t={t}
                      onMerged={(next, replaceAll) => {
                        patchAnchorEvent(event.id, next);
                        if (replaceAll) {
                          setAnchorFieldLocks((prev) => {
                            const n = { ...prev };
                            delete n[event.id];
                            return n;
                          });
                        }
                        pushToast({
                          tone: "success",
                          message: t("events.filledFromProvider", {
                            provider: t(`events.providers.${next.provider ?? "manual"}`, { defaultValue: next.provider ?? "manual" }),
                          }),
                        });
                      }}
                    />
                  </Box>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Button variant="outlined" size="small" onClick={addAnchorEvent}>
                  {t("travelStats.anchorEventsAdd")}
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button
                    fullWidth={editingMemoryId === null}
                    sx={{
                      flex: editingMemoryId ? 1 : undefined,
                      ...(!isDraftValid
                        ? {
                            opacity: 0.52,
                            cursor: "not-allowed",
                            "&:hover": { opacity: 0.58 },
                          }
                        : {}),
                    }}
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    aria-disabled={!isDraftValid}
                    onClick={openSaveFlow}
                  >
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
            {meta.status === "loading" && memories.length === 0 ? <TravelStatsInsightsPanelSkeleton /> : null}
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
                  dateLabel={formatTravelMemoryRange(memory, t)}
                  onOpenDetails={(nextMemory) => setListDrawer({ memory: nextMemory, point: buildPointForMemory(nextMemory) })}
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
    <TravelMemoryDetailDrawer
      open={Boolean(listDrawer)}
      onClose={() => setListDrawer(null)}
      memory={listDrawerMemory}
      point={listDrawer?.point ?? null}
      onMemoryUpdate={handlePersistDrawerMemory}
      instagramConnected={instagramConnected}
      onInstagramConnected={() => void refreshInstagram()}
    />
    </>
  );
};
