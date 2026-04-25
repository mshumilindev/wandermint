import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClientId } from "../../../shared/lib/id";
import { searchPlacesForMustSee } from "../../../services/places/placeSearchService";
import type { PlaceCandidate } from "../../../services/places/placeTypes";
import { deriveMustSeeNotesFromTripPlaces, MAX_MUST_SEE_PLACES, tripPlaceDedupeKey, type TripPlace } from "../../../services/places/placeTypes";

type Row = { kind: "pick"; candidate: PlaceCandidate } | { kind: "custom" };

export type MustSeePlacesFieldProps = {
  places: TripPlace[];
  onChange: (next: TripPlace[], derivedMustSeeNotes: string) => void;
  destinationCity: string;
  destinationCountry: string;
  dateRange: { start: string; end: string };
};

const candidateToTripPlace = (c: PlaceCandidate): TripPlace => ({
  id: createClientId("must_see"),
  mode: "resolved",
  label: c.name,
  candidate: c,
  locked: true,
});

const customTripPlace = (text: string): TripPlace => {
  const trimmed = text.trim();
  return {
    id: createClientId("must_see"),
    mode: "custom",
    label: trimmed,
    customText: trimmed,
    locked: true,
  };
};

export const MustSeePlacesField = ({
  places,
  onChange,
  destinationCity,
  destinationCountry,
  dateRange,
}: MustSeePlacesFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextLabel = useMemo(() => [destinationCity, destinationCountry].filter(Boolean).join(", "), [destinationCity, destinationCountry]);

  const tripDayCount = useMemo(() => {
    const start = dateRange.start?.trim();
    const end = dateRange.end?.trim();
    if (!start || !end) {
      return 0;
    }
    const a = dayjs(start);
    const b = dayjs(end);
    if (!a.isValid() || !b.isValid()) {
      return 0;
    }
    return Math.max(1, b.diff(a, "day") + 1);
  }, [dateRange.end, dateRange.start]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await searchPlacesForMustSee({
          query: trimmed,
          city: destinationCity.trim() || undefined,
          country: destinationCountry.trim() || undefined,
        });
        setOptions(rows);
      } finally {
        setLoading(false);
      }
    },
    [destinationCity, destinationCountry],
  );

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void runSearch(input);
    }, 400);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [input, runSearch]);

  const rows: Row[] = useMemo(() => {
    const picks = options.map((candidate) => ({ kind: "pick" as const, candidate }));
    return [...picks, { kind: "custom" as const }];
  }, [options]);

  const keysInUse = useMemo(() => new Set(places.map(tripPlaceDedupeKey)), [places]);

  const pushPlaces = (next: TripPlace[]): void => {
    onChange(next, deriveMustSeeNotesFromTripPlaces(next));
  };

  const tryAddResolved = (c: PlaceCandidate): void => {
    if (places.length >= MAX_MUST_SEE_PLACES) {
      return;
    }
    const key = tripPlaceDedupeKey({ id: "", mode: "resolved", label: c.name, candidate: c, locked: true });
    if (keysInUse.has(key)) {
      return;
    }
    pushPlaces([...places, candidateToTripPlace(c)]);
    setInput("");
    setOptions([]);
  };

  const tryAddCustom = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed.length < 2 || places.length >= MAX_MUST_SEE_PLACES) {
      return;
    }
    const key = tripPlaceDedupeKey({
      id: "",
      mode: "custom",
      label: trimmed,
      customText: trimmed,
      locked: true,
    });
    if (keysInUse.has(key)) {
      return;
    }
    pushPlaces([...places, customTripPlace(trimmed)]);
    setCustomDraft("");
    setCustomOpen(false);
    setInput("");
    setOptions([]);
  };

  const removeAt = (index: number): void => {
    const next = places.filter((_, i) => i !== index);
    pushPlaces(next);
  };

  const denseMustSeeWarning = tripDayCount > 0 && places.length > tripDayCount + 3;

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {t("wizard.mustSeeNotes")}
      </Typography>
      <Typography variant="caption" color="text.disabled">
        {t("wizard.mustSeeStructured.helper")}
      </Typography>

      {places.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {places.map((p, index) => (
            <Chip
              key={p.id}
              label={p.label}
              onDelete={() => removeAt(index)}
              size="small"
              variant={p.mode === "resolved" ? "filled" : "outlined"}
              color={p.mode === "resolved" ? "primary" : "default"}
            />
          ))}
        </Box>
      ) : null}

      {denseMustSeeWarning ? (
        <Alert severity="warning">{t("wizard.mustSeeStructured.denseWarning", { days: tripDayCount, count: places.length })}</Alert>
      ) : null}

      <Autocomplete<Row, false, false>
        disabled={places.length >= MAX_MUST_SEE_PLACES}
        options={rows}
        loading={loading}
        filterOptions={(x) => x}
        getOptionLabel={(row) => (row.kind === "custom" ? t("wizard.mustSeeStructured.useCustom") : row.candidate.name)}
        isOptionEqualToValue={() => false}
        value={null}
        inputValue={input}
        onInputChange={(_e, v) => setInput(v)}
        onChange={(_e, row) => {
          if (!row) {
            return;
          }
          if (row.kind === "custom") {
            setCustomOpen(true);
            return;
          }
          tryAddResolved(row.candidate);
        }}
        renderOption={(props, row) =>
          row.kind === "custom" ? (
            <li {...props} key="__custom">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t("wizard.mustSeeStructured.useCustom")}
              </Typography>
            </li>
          ) : (
            <li {...props} key={row.candidate.id}>
              <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", py: 0.5, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    flexShrink: 0,
                    bgcolor: "rgba(255,255,255,0.06)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <PlaceOutlinedIcon fontSize="small" color="disabled" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                    {row.candidate.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                    {[row.candidate.city, row.candidate.country].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
              </Box>
            </li>
          )
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={t("wizard.mustSeeStructured.searchLabel")}
            placeholder={t("wizard.mustSeeStructured.searchPlaceholder")}
            helperText={
              places.length >= MAX_MUST_SEE_PLACES
                ? t("wizard.mustSeeStructured.maxReached", { max: MAX_MUST_SEE_PLACES })
                : contextLabel
                  ? t("wizard.mustSeeStructured.helperCity", { place: contextLabel })
                  : t("wizard.mustSeeStructured.helperNoCity")
            }
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        ListboxProps={{ sx: { maxHeight: 320 } }}
        sx={{ "& .MuiAutocomplete-popper": { zIndex: 1400 } }}
      />

      <Button variant="text" size="small" disabled={places.length >= MAX_MUST_SEE_PLACES} onClick={() => setCustomOpen(true)}>
        {t("wizard.mustSeeStructured.addCustomButton")}
      </Button>

      <Dialog open={customOpen} onClose={() => setCustomOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t("wizard.mustSeeStructured.customDialogTitle")}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label={t("wizard.mustSeeStructured.customLabel")}
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            placeholder={t("wizard.mustSeeStructured.customPlaceholder")}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={() => tryAddCustom(customDraft)} disabled={customDraft.trim().length < 2}>
            {t("wizard.mustSeeStructured.addCustomConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
