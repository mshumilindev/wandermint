import HotelOutlinedIcon from "@mui/icons-material/HotelOutlined";
import { Autocomplete, Box, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccommodationCandidate } from "../../../services/accommodation/accommodationTypes";
import type { WizardAccommodationBase } from "../../../services/accommodation/accommodationTypes";
import { searchAccommodations } from "../../../services/accommodation/accommodationSearchService";

type AccommodationBaseSearchFieldProps = {
  label: string;
  city: string;
  country: string;
  value?: WizardAccommodationBase;
  onChange: (next: WizardAccommodationBase | undefined) => void;
  dateRange?: { start: string; end: string };
};

const candidateToBase = (c: AccommodationCandidate): WizardAccommodationBase => ({
  mode: "resolved",
  label: c.name,
  candidate: c,
});

export const AccommodationBaseSearchField = ({
  label,
  city,
  country,
  value,
  onChange,
  dateRange,
}: AccommodationBaseSearchFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [input, setInput] = useState(value?.label ?? "");
  const [options, setOptions] = useState<AccommodationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInput(value?.label ?? "");
  }, [value?.label, value?.mode]);

  const contextLabel = useMemo(() => [city, country].filter(Boolean).join(", "), [city, country]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await searchAccommodations({
          query: trimmed,
          city: city.trim() || undefined,
          country: country.trim() || undefined,
          dateRange,
        });
        setOptions(rows);
      } finally {
        setLoading(false);
      }
    },
    [city, country, dateRange],
  );

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void runSearch(input);
    }, 380);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [input, runSearch]);

  const selectedCandidate = value?.mode === "resolved" ? value.candidate : undefined;

  return (
    <Autocomplete
      freeSolo
      options={options}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
      value={selectedCandidate ?? null}
      inputValue={input}
      onInputChange={(_e, v) => setInput(v)}
      onChange={(_e, newValue) => {
        if (!newValue) {
          onChange(undefined);
          return;
        }
        if (typeof newValue === "string") {
          onChange({
            mode: "custom",
            label: newValue.trim(),
            customText: newValue.trim(),
          });
          return;
        }
        onChange(candidateToBase(newValue));
      }}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", py: 0.5, minWidth: 0 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 1,
                flexShrink: 0,
                bgcolor: "rgba(255,255,255,0.06)",
                backgroundImage: option.imageUrl ? `url(${option.imageUrl})` : undefined,
                backgroundSize: "cover",
                display: "grid",
                placeItems: "center",
              }}
            >
              {!option.imageUrl ? <HotelOutlinedIcon fontSize="small" color="disabled" /> : null}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                {option.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                {[option.address, option.city, option.country].filter(Boolean).join(" · ")}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                <Chip size="small" label={option.provider.replace(/_/g, " ")} variant="outlined" />
                {option.mergedFromProviders && option.mergedFromProviders.length > 1 ? (
                  <Chip size="small" label={t("wizard.accommodation.mergedSources")} variant="filled" color="primary" />
                ) : null}
                {typeof option.rating === "number" ? (
                  <Chip size="small" label={`★ ${option.rating.toFixed(1)}`} variant="outlined" />
                ) : null}
              </Box>
            </Box>
          </Box>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={
            contextLabel
              ? t("wizard.accommodation.helperCity", { place: contextLabel })
              : t("wizard.accommodation.helperNoCity")
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
  );
};
