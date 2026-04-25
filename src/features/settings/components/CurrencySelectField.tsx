import { Autocomplete, Box, CircularProgress, ListSubheader, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildOrderedCurrencyOptions,
  fetchCurrencyCatalog,
  formatCurrencyGlyph,
  type CurrencyCatalog,
  type CurrencyOption,
  type CurrencyOptionGroup,
} from "../../../services/currency/currencyCatalogService";

interface CurrencySelectFieldProps {
  homeCityLabel: string;
  value: string;
  onChange: (code: string) => void;
  locale?: string;
  disabled?: boolean;
  label: string;
}

export const CurrencySelectField = ({
  homeCityLabel,
  value,
  onChange,
  locale = "en",
  disabled,
  label,
}: CurrencySelectFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<CurrencyCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchCurrencyCatalog(locale)
      .then((c) => {
        if (active) {
          setCatalog(c);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const options = useMemo(() => {
    if (!catalog) {
      return [];
    }
    return buildOrderedCurrencyOptions(homeCityLabel, catalog, locale);
  }, [catalog, homeCityLabel, locale]);

  const selected = useMemo((): CurrencyOption | null => {
    const upper = value.trim().toUpperCase();
    if (!upper || !/^[A-Z]{3}$/.test(upper)) {
      return null;
    }
    const fromList = options.find((o) => o.code === upper);
    if (fromList) {
      return fromList;
    }
    if (!catalog) {
      return null;
    }
    const meta = catalog.byCode[upper];
    if (meta) {
      return { code: upper, name: meta.name, symbol: meta.symbol, group: "other" };
    }
    return { code: upper, name: upper, symbol: formatCurrencyGlyph(upper, locale), group: "other" };
  }, [options, value, catalog, locale]);

  const groupTitle = (group: CurrencyOptionGroup): string => {
    switch (group) {
      case "home":
        return t("settings.currencyGroup.home");
      case "region":
        return t("settings.currencyGroup.region");
      case "popular":
        return t("settings.currencyGroup.popular");
      default:
        return t("settings.currencyGroup.other");
    }
  };

  if (loading && !catalog) {
    return (
      <TextField
        label={label}
        disabled
        fullWidth
        sx={{ minWidth: { sm: 220 }, flex: "1 1 200px" }}
        InputProps={{
          endAdornment: <CircularProgress color="inherit" size={20} sx={{ mr: 1 }} />,
        }}
      />
    );
  }

  return (
    <Autocomplete<CurrencyOption, false, false, false>
      sx={{ minWidth: { sm: 260 }, flex: "1 1 240px" }}
      options={options}
      groupBy={(option) => option.group}
      getOptionLabel={(option) => option.code}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      value={selected}
      onChange={(_, next) => onChange(next?.code ?? "")}
      disabled={disabled || loading}
      filterOptions={(opts, { inputValue }) => {
        const q = inputValue.trim().toLowerCase();
        if (!q) {
          return opts;
        }
        return opts.filter(
          (o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || o.symbol.toLowerCase().includes(q),
        );
      }}
      renderGroup={(params) => (
        <li key={params.key}>
          <ListSubheader
            component="div"
            sx={{
              bgcolor: "rgba(4, 11, 19, 0.92)",
              color: "primary.light",
              fontWeight: 700,
              lineHeight: 2.2,
              position: "sticky",
              top: -8,
              zIndex: 1,
            }}
          >
            {groupTitle(params.group as CurrencyOptionGroup)}
          </ListSubheader>
          {params.children}
        </li>
      )}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.code} sx={{ display: "flex !important", alignItems: "center", gap: 1.5, py: 0.75 }}>
          <Box
            sx={{
              width: 44,
              minWidth: 44,
              height: 40,
              borderRadius: 1.5,
              bgcolor: "rgba(0, 180, 216, 0.12)",
              border: "1px solid rgba(0, 180, 216, 0.22)",
              display: "grid",
              placeItems: "center",
              fontSize: "1.15rem",
              fontWeight: 700,
              color: "primary.light",
            }}
          >
            {option.symbol}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {option.code}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
              {option.name}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={18} sx={{ mr: 0.5 }} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      ListboxProps={{ style: { maxHeight: 380 } }}
    />
  );
};
