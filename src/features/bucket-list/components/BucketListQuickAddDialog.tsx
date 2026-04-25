import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import LocalBarRoundedIcon from "@mui/icons-material/LocalBarRounded";
import MuseumRoundedIcon from "@mui/icons-material/MuseumRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import ParkRoundedIcon from "@mui/icons-material/ParkRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { usePrivacySettingsStore } from "../../../app/store/usePrivacySettingsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { getErrorMessage } from "../../../shared/lib/errors";
import { publicGeoProvider } from "../../../services/providers/publicGeoProvider";
import { mapDiscoveryItemToBucketItem } from "../bucketListDiscoveryMapper";
import { bucketListService } from "../bucketListService";
import { searchDiscoveryItems } from "../discovery/bucketListDiscoverySearchService";
import type { DiscoveryCategory, DiscoveryItem } from "../discovery/bucketListDiscovery.types";
import { useBucketListQuickAddStore } from "../bucketListQuickAddStore";
import type { BucketListPriority } from "../bucketList.types";

const splitLabelToCityCountry = (label: string): { city?: string; country?: string } => {
  const bits = label
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (bits.length === 0) {
    return {};
  }
  if (bits.length === 1) {
    return { city: bits[0] };
  }
  return { city: bits[bits.length - 2], country: bits[bits.length - 1] };
};

const CURATED = [
  { titleKey: "bucketList.recoTitles.eiffel", geocodeQuery: "Eiffel Tower, Paris, France" },
  { titleKey: "bucketList.recoTitles.colosseum", geocodeQuery: "Colosseum, Rome, Italy" },
  { titleKey: "bucketList.recoTitles.angkor", geocodeQuery: "Angkor Wat, Siem Reap, Cambodia" },
  { titleKey: "bucketList.recoTitles.petra", geocodeQuery: "Petra, Jordan" },
  { titleKey: "bucketList.recoTitles.machu", geocodeQuery: "Machu Picchu, Peru" },
] as const;

export const BucketListQuickAddDialog = (): JSX.Element => {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const externalEventSearchAllowed = usePrivacySettingsStore((state) => state.settings?.allowExternalEventSearch === true);
  const open = useBucketListQuickAddStore((s) => s.open);
  const closeDialog = useBucketListQuickAddStore((s) => s.closeDialog);
  const notifyListChanged = useBucketListQuickAddStore((s) => s.notifyListChanged);
  const pushToast = useUiStore((state) => state.pushToast);

  const [tab, setTab] = useState(0);
  const [priority, setPriority] = useState<BucketListPriority>("medium");
  const [pending, setPending] = useState(false);

  const [manualCity, setManualCity] = useState("");
  const [manualCountry, setManualCountry] = useState("");

  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [discoveryCategory, setDiscoveryCategory] = useState<DiscoveryCategory>("all");
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryItem[]>([]);
  const [discoveryStatus, setDiscoveryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState<string | null>(null);
  const [discoveryNotes, setDiscoveryNotes] = useState("");
  const [discoveryPriority, setDiscoveryPriority] = useState<BucketListPriority>("medium");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const [experienceLabel, setExperienceLabel] = useState("");

  const resetForm = useCallback((): void => {
    setTab(0);
    setPriority("medium");
    setManualCity("");
    setManualCountry("");
    setDiscoveryQuery("");
    setDiscoveryCategory("all");
    setDiscoveryResults([]);
    setDiscoveryStatus("idle");
    setDiscoveryError(null);
    setSelectedDiscoveryId(null);
    setDiscoveryNotes("");
    setDiscoveryPriority("medium");
    setExperienceLabel("");
  }, []);

  const handleClose = (): void => {
    if (!pending) {
      resetForm();
      closeDialog();
    }
  };

  const afterAdd = (): void => {
    notifyListChanged();
    pushToast({ message: t("bucketList.addedToast"), tone: "success" });
    resetForm();
    closeDialog();
  };

  const saveDestination = async (): Promise<void> => {
    if (!userId) {
      pushToast({ message: t("bucketList.signInToSave"), tone: "warning" });
      return;
    }
    const city = manualCity.trim();
    const country = manualCountry.trim();
    if (!city || !country) {
      pushToast({ message: t("bucketList.destinationNeedCityCountry"), tone: "warning" });
      return;
    }
    setPending(true);
    try {
      let coordinates: { lat: number; lng: number } | undefined;
      const geocode = await publicGeoProvider.geocode(`${city}, ${country}`).catch(() => null);
      if (geocode) {
        coordinates = { lat: geocode.latitude, lng: geocode.longitude };
      }
      await bucketListService.addOrUpdateItem(userId, {
        userId,
        payload: {
          type: "destination",
          location: {
            city,
            country,
            coordinates,
          },
        },
        category: "destination",
        source: "manual",
        priority,
      });
      afterAdd();
    } catch (e) {
      pushToast({ message: `${t("bucketList.saveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setPending(false);
    }
  };

  const runDiscoverySearch = useCallback(async (): Promise<void> => {
    const q = discoveryQuery.trim();
    if (q.length < 2) {
      setDiscoveryStatus("idle");
      setDiscoveryResults([]);
      setDiscoveryError(null);
      return;
    }
    const req = ++requestSeq.current;
    setDiscoveryStatus("loading");
    setDiscoveryError(null);
    try {
      const result = await searchDiscoveryItems({
        query: q,
        category: discoveryCategory,
        limit: 12,
        externalEventSearchAllowed,
      });
      if (req !== requestSeq.current) {
        return;
      }
      setDiscoveryResults(result.items);
      setDiscoveryStatus("ready");
      if (result.items.length > 0) {
        setSelectedDiscoveryId((prev) => prev ?? result.items[0]!.id);
      }
    } catch {
      if (req !== requestSeq.current) {
        return;
      }
      setDiscoveryStatus("error");
      setDiscoveryError(t("bucketList.discoveryError"));
      setDiscoveryResults([]);
    }
  }, [discoveryCategory, discoveryQuery, externalEventSearchAllowed, t]);

  useEffect(() => {
    if (tab !== 0) {
      return;
    }
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      void runDiscoverySearch();
    }, 420);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [tab, discoveryQuery, discoveryCategory, runDiscoverySearch]);

  const selectedDiscovery = useMemo(
    () => discoveryResults.find((row) => row.id === selectedDiscoveryId) ?? null,
    [discoveryResults, selectedDiscoveryId],
  );

  const addSelectedDiscovery = async (): Promise<void> => {
    if (!userId) {
      pushToast({ message: t("bucketList.signInToSave"), tone: "warning" });
      return;
    }
    if (!selectedDiscovery) {
      pushToast({ message: t("bucketList.discoverySelectFirst"), tone: "warning" });
      return;
    }
    setPending(true);
    try {
      const mapped = mapDiscoveryItemToBucketItem(selectedDiscovery, {
        userId,
        priority: discoveryPriority,
        notes: discoveryNotes,
      });
      await bucketListService.addOrUpdateItem(userId, mapped);
      afterAdd();
    } catch (e) {
      pushToast({ message: `${t("bucketList.saveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setPending(false);
    }
  };

  const addCurated = async (row: (typeof CURATED)[number]): Promise<void> => {
    if (!userId) {
      pushToast({ message: t("bucketList.signInToSave"), tone: "warning" });
      return;
    }
    setPending(true);
    try {
      const pt = await publicGeoProvider.geocode(row.geocodeQuery);
      const loc = splitLabelToCityCountry(pt.label);
      const city = (loc.city ?? "").trim();
      const country = (loc.country ?? "").trim();
      if (!city || !country) {
        pushToast({ message: t("bucketList.destinationNeedCityCountry"), tone: "warning" });
        return;
      }
      await bucketListService.addOrUpdateItem(userId, {
        userId,
        payload: {
          type: "destination",
          location: {
            city,
            country,
            coordinates: { lat: pt.latitude, lng: pt.longitude },
          },
        },
        category: "landmark",
        source: "recommendation",
        priority,
      });
      afterAdd();
    } catch (e) {
      pushToast({ message: `${t("bucketList.saveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setPending(false);
    }
  };

  const saveExperience = async (): Promise<void> => {
    if (!userId) {
      pushToast({ message: t("bucketList.signInToSave"), tone: "warning" });
      return;
    }
    const label = experienceLabel.trim();
    if (label.length < 2) {
      pushToast({ message: t("bucketList.experienceNeedLabel"), tone: "warning" });
      return;
    }
    setPending(true);
    try {
      await bucketListService.addOrUpdateItem(userId, {
        userId,
        payload: { type: "experience", label },
        category: "experience",
        source: "manual",
        priority,
      });
      afterAdd();
    } catch (e) {
      pushToast({ message: `${t("bucketList.saveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("bucketList.quickAddTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<TravelExploreRoundedIcon fontSize="small" />} iconPosition="start" label={t("bucketList.tabDiscover")} />
          <Tab label={t("bucketList.tabDestination")} />
          <Tab label={t("bucketList.tabExperience")} />
          <Tab label={t("bucketList.tabIdeas")} />
        </Tabs>

        {tab === 0 ? (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("bucketList.discoveryHint")}
            </Typography>
            <TextField
              label={t("bucketList.discoverySearchLabel")}
              placeholder={t("bucketList.discoverySearchPlaceholder")}
              value={discoveryQuery}
              onChange={(e) => setDiscoveryQuery(e.target.value)}
              fullWidth
              size="small"
              disabled={pending}
              InputProps={{
                startAdornment: <SearchRoundedIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />,
              }}
            />
            <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5 }}>
              {([
                ["all", t("bucketList.discoveryCategoryAll"), <SearchRoundedIcon fontSize="small" />],
                ["places", t("bucketList.discoveryCategoryPlaces"), <PlaceRoundedIcon fontSize="small" />],
                ["food", t("bucketList.discoveryCategoryFood"), <RestaurantRoundedIcon fontSize="small" />],
                ["drinks", t("bucketList.discoveryCategoryDrinks"), <LocalBarRoundedIcon fontSize="small" />],
                ["events", t("bucketList.discoveryCategoryEvents"), <EventRoundedIcon fontSize="small" />],
                ["museums", t("bucketList.discoveryCategoryMuseums"), <MuseumRoundedIcon fontSize="small" />],
                ["nature", t("bucketList.discoveryCategoryNature"), <ParkRoundedIcon fontSize="small" />],
                ["nightlife", t("bucketList.discoveryCategoryNightlife"), <LocalBarRoundedIcon fontSize="small" />],
                ["hidden_gems", t("bucketList.discoveryCategoryHidden"), <StarRoundedIcon fontSize="small" />],
                ["photo_spots", t("bucketList.discoveryCategoryPhoto"), <PhotoCameraRoundedIcon fontSize="small" />],
              ] as const).map(([key, label, icon]) => (
                <Chip
                  key={key}
                  icon={icon}
                  label={label}
                  clickable
                  color={discoveryCategory === key ? "primary" : "default"}
                  variant={discoveryCategory === key ? "filled" : "outlined"}
                  onClick={() => setDiscoveryCategory(key)}
                />
              ))}
            </Box>

            {discoveryStatus === "idle" ? (
              <Alert severity="info">{t("bucketList.discoveryEmptyState")}</Alert>
            ) : null}
            {discoveryStatus === "error" ? (
              <Alert
                severity="warning"
                icon={<ErrorOutlineRoundedIcon />}
                action={
                  <Button color="inherit" size="small" onClick={() => void runDiscoverySearch()}>
                    {t("common.retry")}
                  </Button>
                }
              >
                {discoveryError || t("bucketList.discoveryError")}
              </Alert>
            ) : null}
            {discoveryStatus === "loading" ? (
              <Box sx={{ display: "grid", gap: 1.25 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Box key={i} sx={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 1.25, p: 1.25, borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Skeleton variant="rounded" height={72} />
                    <Box>
                      <Skeleton variant="text" width="70%" />
                      <Skeleton variant="text" width="45%" />
                      <Skeleton variant="text" width="30%" />
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : null}
            {discoveryStatus === "ready" && discoveryResults.length === 0 ? (
              <Alert severity="info">{t("bucketList.discoveryNoResults")}</Alert>
            ) : null}
            {discoveryResults.length > 0 ? (
              <Box sx={{ display: "grid", gap: 1, maxHeight: 320, overflowY: "auto", pr: 0.5 }}>
                {discoveryResults.map((item) => {
                  const selected = selectedDiscoveryId === item.id;
                  return (
                    <Box
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDiscoveryId(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedDiscoveryId(item.id);
                        }
                      }}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "112px 1fr",
                        gap: 1.25,
                        p: 1.25,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: selected ? "primary.main" : "rgba(255,255,255,0.1)",
                        background: selected ? "rgba(0,180,216,0.09)" : "rgba(3, 15, 23, 0.45)",
                        boxShadow: selected ? "0 0 0 1px rgba(0,180,216,0.35), 0 6px 22px rgba(0,180,216,0.14)" : "none",
                        cursor: "pointer",
                        "&:hover": {
                          borderColor: selected ? "primary.main" : "rgba(0,180,216,0.35)",
                        },
                      }}
                      aria-pressed={selected}
                      aria-label={`${item.title} ${item.location?.city ?? ""}`}
                    >
                      <Box
                        role="img"
                        aria-label={item.imageAlt}
                        sx={{
                          borderRadius: 1.5,
                          overflow: "hidden",
                          minHeight: 80,
                          backgroundColor: "rgba(7, 20, 31, 0.9)",
                          backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : "linear-gradient(130deg, rgba(0,180,216,0.24), rgba(114,9,183,0.25), rgba(6,15,31,0.9))",
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {!item.imageUrl ? <TravelExploreRoundedIcon sx={{ color: "rgba(255,255,255,0.82)" }} /> : null}
                      </Box>
                      <Box sx={{ minWidth: 0, display: "grid", gap: 0.35 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }} noWrap>
                          {item.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {item.category ? item.category.replace(/_/g, " ") : item.type.replace(/_/g, " ")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {[item.location?.city, item.location?.country].filter(Boolean).join(", ") || t("bucketList.locationUnknown")}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap" }}>
                          {typeof item.rating === "number" ? (
                            <Chip size="small" icon={<StarRoundedIcon fontSize="small" />} label={item.rating.toFixed(1)} variant="outlined" />
                          ) : null}
                          <Chip size="small" label={item.source.label} variant="outlined" />
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            ) : null}
            {selectedDiscovery ? (
              <Box sx={{ p: 1.5, borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(3,15,23,0.6)", display: "grid", gap: 1.25 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {t("bucketList.discoveryPreviewTitle")}
                </Typography>
                <Box
                  role="img"
                  aria-label={selectedDiscovery.imageAlt}
                  sx={{
                    width: "100%",
                    height: 180,
                    borderRadius: 1.5,
                    backgroundColor: "rgba(7, 20, 31, 0.9)",
                    backgroundImage: selectedDiscovery.imageUrl
                      ? `url(${selectedDiscovery.imageUrl})`
                      : "linear-gradient(135deg, rgba(0,180,216,0.25), rgba(114,9,183,0.25), rgba(6,15,31,0.9))",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {!selectedDiscovery.imageUrl ? <TravelExploreRoundedIcon sx={{ color: "rgba(255,255,255,0.85)" }} /> : null}
                </Box>
                <Typography variant="h6">{selectedDiscovery.title}</Typography>
                {selectedDiscovery.description ? (
                  <Typography variant="body2" color="text.secondary">
                    {selectedDiscovery.description}
                  </Typography>
                ) : null}
                <Typography variant="caption" color="text.secondary">
                  {[selectedDiscovery.location?.city, selectedDiscovery.location?.country].filter(Boolean).join(", ")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedDiscovery.source.label}
                </Typography>
                {selectedDiscovery.source.url ? (
                  <Button
                    variant="text"
                    size="small"
                    component="a"
                    href={selectedDiscovery.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ justifyContent: "flex-start", px: 0 }}
                  >
                    {t("bucketList.discoveryOpenSource")}
                  </Button>
                ) : null}
                {selectedDiscovery.event?.startDate ? (
                  <Typography variant="caption" color="text.secondary">
                    {selectedDiscovery.event.startDate}
                    {selectedDiscovery.event.venueName ? ` · ${selectedDiscovery.event.venueName}` : ""}
                  </Typography>
                ) : null}
                <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
                <Typography variant="caption" color="text.secondary">
                  {t("bucketList.discoveryPriorityLabel")}
                </Typography>
                <ButtonGroup size="small" aria-label={t("bucketList.discoveryPriorityLabel")}>
                  {(["low", "medium", "high"] as const).map((p) => (
                    <Button key={p} variant={discoveryPriority === p ? "contained" : "outlined"} onClick={() => setDiscoveryPriority(p)} disabled={pending}>
                      {t(`common.level.${p}`)}
                    </Button>
                  ))}
                </ButtonGroup>
                <TextField
                  label={t("bucketList.discoveryNotesLabel")}
                  value={discoveryNotes}
                  onChange={(e) => setDiscoveryNotes(e.target.value)}
                  size="small"
                  multiline
                  minRows={2}
                  InputProps={{ startAdornment: <NotesRoundedIcon fontSize="small" sx={{ mr: 1, mt: 1, color: "text.secondary" }} /> }}
                />
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => void addSelectedDiscovery()} disabled={pending}>
                  {pending ? <CircularProgress size={18} color="inherit" /> : t("bucketList.discoveryAddButton")}
                </Button>
              </Box>
            ) : null}
          </Box>
        ) : null}

        {tab === 1 ? (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("bucketList.destinationHint")}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.25 }}>
              <TextField
                label={t("bucketList.fieldCity")}
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                fullWidth
                size="small"
                disabled={pending}
              />
              <TextField
                label={t("bucketList.fieldCountry")}
                value={manualCountry}
                onChange={(e) => setManualCountry(e.target.value)}
                fullWidth
                size="small"
                disabled={pending}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t("bucketList.priorityQuick")}
            </Typography>
            <ButtonGroup size="small" aria-label={t("bucketList.priorityQuick")}>
              {(["low", "medium", "high"] as const).map((p) => (
                <Button key={p} variant={priority === p ? "contained" : "outlined"} onClick={() => setPriority(p)} disabled={pending}>
                  {t(`common.level.${p}`)}
                </Button>
              ))}
            </ButtonGroup>
          </Box>
        ) : null}

        {tab === 2 ? (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("bucketList.experienceHint")}
            </Typography>
            <TextField
              label={t("bucketList.experienceLabel")}
              value={experienceLabel}
              onChange={(e) => setExperienceLabel(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              size="small"
              disabled={pending}
            />
          </Box>
        ) : null}

        {tab === 3 ? (
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("bucketList.ideasHint")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {CURATED.map((row) => (
                <Button key={row.titleKey} variant="outlined" onClick={() => void addCurated(row)} disabled={pending} sx={{ justifyContent: "flex-start", textTransform: "none" }}>
                  {t(row.titleKey)}
                </Button>
              ))}
            </Box>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={pending}>
          {t("common.cancel")}
        </Button>
        {tab === 1 ? (
          <Button variant="contained" onClick={() => void saveDestination()} disabled={pending}>
            {t("bucketList.saveItem")}
          </Button>
        ) : null}
        {tab === 2 ? (
          <Button variant="contained" onClick={() => void saveExperience()} disabled={pending}>
            {t("bucketList.saveItem")}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
};
