import DirectionsTransitIcon from "@mui/icons-material/DirectionsTransit";
import {
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchTransportNodes } from "../../../services/transport/transportNodeSearchService";
import type { TransportNode, TransportNodeType } from "../../../services/transport/transportNodeTypes";

type Filter = "all" | TransportNodeType;

export type TransportNodeSearchFieldProps = {
  label: string;
  helperText?: string;
  city: string;
  country: string;
  value?: TransportNode;
  onChange: (next: TransportNode | undefined) => void;
  disabled?: boolean;
};

export const TransportNodeSearchField = ({
  label,
  helperText,
  city,
  country,
  value,
  onChange,
  disabled,
}: TransportNodeSearchFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [input, setInput] = useState(value?.place.name ?? "");
  const [options, setOptions] = useState<TransportNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInput(value?.place.name ?? "");
  }, [value?.place.name]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await searchTransportNodes({
          query: trimmed,
          city: city.trim() || undefined,
          country: country.trim() || undefined,
        });
        setOptions(rows);
      } finally {
        setLoading(false);
      }
    },
    [city, country],
  );

  useEffect(() => {
    if (disabled) {
      return;
    }
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
  }, [disabled, input, runSearch]);

  const filtered = useMemo(() => {
    if (filter === "all") {
      return options;
    }
    return options.filter((o) => o.type === filter);
  }, [filter, options]);

  const contextLabel = useMemo(() => [city, country].filter(Boolean).join(", "), [city, country]);

  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <DirectionsTransitIcon sx={{ fontSize: 16 }} />
        {label}
      </Typography>
      {value ? (
        <Chip
          label={`${value.type.toUpperCase()} · ${value.place.name}`}
          onDelete={() => onChange(undefined)}
          size="small"
          color="primary"
          variant="outlined"
        />
      ) : null}
      <ToggleButtonGroup
        exclusive
        size="small"
        value={filter}
        disabled={disabled}
        onChange={(_e, v) => {
          if (v) {
            setFilter(v as Filter);
          }
        }}
        sx={{ flexWrap: "wrap" }}
      >
        <ToggleButton value="all">{t("wizard.transport.filterAll")}</ToggleButton>
        <ToggleButton value="train">{t("wizard.transport.train")}</ToggleButton>
        <ToggleButton value="bus">{t("wizard.transport.bus")}</ToggleButton>
        <ToggleButton value="ferry">{t("wizard.transport.ferry")}</ToggleButton>
        <ToggleButton value="metro">{t("wizard.transport.metro")}</ToggleButton>
      </ToggleButtonGroup>
      <Autocomplete<TransportNode, false, false>
        disabled={disabled}
        options={filtered}
        loading={loading}
        filterOptions={(x) => x}
        getOptionLabel={(opt) => `${opt.place.name} (${opt.type})`}
        value={value ?? null}
        inputValue={input}
        onInputChange={(_e, v) => setInput(v)}
        onChange={(_e, v) => {
          onChange(v ?? undefined);
          if (v) {
            setInput(v.place.name);
          }
        }}
        renderOption={(props, option) => (
          <li {...props} key={option.place.id}>
            <Box sx={{ py: 0.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                {option.place.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.type.toUpperCase()} · {[option.place.city, option.place.country].filter(Boolean).join(", ")}
              </Typography>
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t("wizard.transport.searchLabel")}
            placeholder={t("wizard.transport.searchPlaceholder")}
            helperText={
              helperText ??
              (contextLabel ? t("wizard.transport.helperCity", { place: contextLabel }) : t("wizard.transport.helperNoCity"))
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
        ListboxProps={{ sx: { maxHeight: 280 } }}
        sx={{ "& .MuiAutocomplete-popper": { zIndex: 1400 } }}
      />
    </Box>
  );
};
