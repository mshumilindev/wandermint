import LocationSearchingRoundedIcon from "@mui/icons-material/LocationSearchingRounded";
import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useUiStore } from "../../../app/store/useUiStore";
import type { PlaceSnapshot } from "../../../entities/activity/model";
import { getErrorMessage } from "../../../shared/lib/errors";
import { publicGeoProvider } from "../../../services/providers/publicGeoProvider";
import { publicPlacesProvider } from "../../../services/providers/publicPlacesProvider";
import { placeSnapshotToPlaceCandidate } from "../bucketListNormalize";
import { bucketListService } from "../bucketListService";
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
  const open = useBucketListQuickAddStore((s) => s.open);
  const closeDialog = useBucketListQuickAddStore((s) => s.closeDialog);
  const notifyListChanged = useBucketListQuickAddStore((s) => s.notifyListChanged);
  const pushToast = useUiStore((state) => state.pushToast);

  const [tab, setTab] = useState(0);
  const [priority, setPriority] = useState<BucketListPriority>("medium");
  const [pending, setPending] = useState(false);

  const [manualLine, setManualLine] = useState("");
  const [resolvedGeo, setResolvedGeo] = useState<{ lat: number; lng: number; label: string; city?: string; country?: string } | null>(null);

  const [searchAnchor, setSearchAnchor] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<PlaceSnapshot[]>([]);

  const [experienceLabel, setExperienceLabel] = useState("");

  const resetForm = useCallback((): void => {
    setTab(0);
    setPriority("medium");
    setManualLine("");
    setResolvedGeo(null);
    setSearchAnchor("");
    setSearchQuery("");
    setSearchHits([]);
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

  const resolveManualAndReturn = async (): Promise<{
    lat: number;
    lng: number;
    label: string;
    city?: string;
    country?: string;
  } | null> => {
    const q = manualLine.trim();
    if (!q) {
      pushToast({ message: t("bucketList.manualNeedLine"), tone: "warning" });
      return null;
    }
    setPending(true);
    setResolvedGeo(null);
    try {
      const pt = await publicGeoProvider.geocode(q);
      const loc = splitLabelToCityCountry(pt.label);
      const geo = {
        lat: pt.latitude,
        lng: pt.longitude,
        label: pt.label,
        city: loc.city,
        country: loc.country,
      };
      setResolvedGeo(geo);
      return geo;
    } catch (e) {
      pushToast({ message: `${t("bucketList.resolveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
      return null;
    } finally {
      setPending(false);
    }
  };

  const saveDestination = async (): Promise<void> => {
    if (!userId) {
      pushToast({ message: t("bucketList.signInToSave"), tone: "warning" });
      return;
    }
    const geo = resolvedGeo ?? (await resolveManualAndReturn());
    if (!geo) {
      return;
    }
    const city = (geo.city ?? splitLabelToCityCountry(geo.label).city ?? "").trim();
    const country = (geo.country ?? splitLabelToCityCountry(geo.label).country ?? "").trim();
    if (!city || !country) {
      pushToast({ message: t("bucketList.destinationNeedCityCountry"), tone: "warning" });
      return;
    }
    setPending(true);
    try {
      await bucketListService.addOrUpdateItem(userId, {
        userId,
        payload: {
          type: "destination",
          location: {
            city,
            country,
            coordinates: { lat: geo.lat, lng: geo.lng },
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

  const runSearch = async (): Promise<void> => {
    if (!userId) {
      pushToast({ message: t("bucketList.signInToSave"), tone: "warning" });
      return;
    }
    const anchor = searchAnchor.trim();
    const query = searchQuery.trim();
    if (anchor.length < 2 || query.length < 2) {
      pushToast({ message: t("bucketList.searchNeedBoth"), tone: "warning" });
      return;
    }
    setPending(true);
    setSearchHits([]);
    try {
      const hits = await publicPlacesProvider.searchPlaces({
        locationLabel: anchor,
        query,
        categories: [],
        radiusMeters: 3200,
      });
      setSearchHits(hits);
      if (hits.length === 0) {
        pushToast({ message: t("bucketList.searchNoResults"), tone: "info" });
      }
    } catch (e) {
      pushToast({ message: `${t("bucketList.searchFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setPending(false);
    }
  };

  const addFromPlace = async (place: PlaceSnapshot): Promise<void> => {
    if (!userId) {
      pushToast({ message: t("bucketList.signInToSave"), tone: "warning" });
      return;
    }
    const lat = place.latitude;
    const lng = place.longitude;
    if (lat === undefined || lng === undefined) {
      pushToast({ message: t("bucketList.placeMissingCoords"), tone: "warning" });
      return;
    }
    setPending(true);
    try {
      const candidate = placeSnapshotToPlaceCandidate(place);
      await bucketListService.addOrUpdateItem(userId, {
        userId,
        payload: { type: "place", place: candidate },
        category: "place",
        source: "imported",
        priority,
      });
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
          <Tab label={t("bucketList.tabDestination")} />
          <Tab label={t("bucketList.tabSearchPlace")} />
          <Tab label={t("bucketList.tabExperience")} />
          <Tab label={t("bucketList.tabIdeas")} />
        </Tabs>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
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

        {tab === 0 ? (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("bucketList.destinationHint")}
            </Typography>
            <TextField
              label={t("bucketList.manualLineLabel")}
              value={manualLine}
              onChange={(e) => {
                setManualLine(e.target.value);
                setResolvedGeo(null);
              }}
              fullWidth
              size="small"
              disabled={pending}
            />
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={() => void resolveManualAndReturn()} disabled={pending}>
                {pending ? <CircularProgress size={18} /> : t("bucketList.resolve")}
              </Button>
            </Box>
            {resolvedGeo ? (
              <Typography variant="body2" color="text.secondary">
                {resolvedGeo.label}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        {tab === 1 ? (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("bucketList.searchHint")}
            </Typography>
            <TextField
              label={t("bucketList.searchAnchor")}
              value={searchAnchor}
              onChange={(e) => setSearchAnchor(e.target.value)}
              fullWidth
              size="small"
              disabled={pending}
              placeholder="Paris, France"
            />
            <TextField
              label={t("bucketList.searchQuery")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
              size="small"
              disabled={pending}
              placeholder={t("bucketList.searchQueryPlaceholder")}
            />
            <Button variant="outlined" startIcon={<LocationSearchingRoundedIcon />} onClick={() => void runSearch()} disabled={pending}>
              {pending ? <CircularProgress size={18} /> : t("bucketList.searchRun")}
            </Button>
            {searchHits.length > 0 ? (
              <List dense disablePadding sx={{ maxHeight: 240, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                {searchHits.map((place) => (
                  <ListItemButton key={`${place.provider}-${place.providerPlaceId ?? place.name}`} onClick={() => void addFromPlace(place)} disabled={pending}>
                    <ListItemText primary={place.name} secondary={[place.city, place.country].filter(Boolean).join(", ") || undefined} />
                  </ListItemButton>
                ))}
              </List>
            ) : null}
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
        {tab === 0 ? (
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
