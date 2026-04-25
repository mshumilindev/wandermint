import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Autocomplete,
  Box,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useTranslation } from "react-i18next";
import { citySearchProvider } from "../../services/providers/citySearchProvider";
import type { CitySearchResult } from "../../services/providers/contracts";
import { getErrorMessage } from "../lib/errors";
import { CountryFlag } from "./CountryFlag";

export interface LocationOption {
  label: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  source: "search" | "existing";
}

interface LocationAutocompleteFieldProps {
  label: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  placeholder?: string;
  helperText?: string;
  error?: boolean;
  disabled?: boolean;
  onSelect: (value: LocationOption | null) => void;
}

const toLocationOption = (result: CitySearchResult): LocationOption => ({
  label: `${result.city}, ${result.country}`,
  city: result.city,
  country: result.country,
  latitude: result.latitude,
  longitude: result.longitude,
  region: result.region,
  source: "search",
});

const createExistingValue = (
  city?: string,
  country?: string,
  latitude?: number,
  longitude?: number,
): LocationOption | null => {
  if (!city?.trim()) {
    return null;
  }

  return {
    label: country?.trim() ? `${city.trim()}, ${country.trim()}` : city.trim(),
    city: city.trim(),
    country: country?.trim() ?? "",
    latitude,
    longitude,
    source: "existing",
  };
};

export const LocationAutocompleteField = ({
  label,
  city,
  country,
  latitude,
  longitude,
  placeholder,
  helperText,
  error,
  disabled,
  onSelect,
}: LocationAutocompleteFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deferredInputValue = useDeferredValue(inputValue);

  const selectedValue = useMemo(
    () => createExistingValue(city, country, latitude, longitude),
    [city, country, latitude, longitude],
  );

  useEffect(() => {
    setInputValue(selectedValue?.label ?? "");
  }, [selectedValue?.label]);

  useEffect(() => {
    const query = deferredInputValue.trim();
    if (query.length < 2) {
      setOptions([]);
      setSearchError(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setSearchError(null);

    const timeoutId = window.setTimeout(() => {
      void citySearchProvider
        .searchCities(query)
        .then((results) => {
          if (!isActive) {
            return;
          }

          startTransition(() => {
            setOptions(results.map(toLocationOption));
          });
        })
        .catch((nextError) => {
          if (!isActive) {
            return;
          }

          setOptions([]);
          setSearchError(getErrorMessage(nextError));
        })
        .finally(() => {
          if (isActive) {
            setIsLoading(false);
          }
        });
    }, 280);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [deferredInputValue]);

  return (
    <Autocomplete<LocationOption, false, false, false>
      fullWidth
      autoHighlight
      includeInputInList={false}
      clearOnBlur={false}
      handleHomeEndKeys
      filterOptions={(values) => values}
      options={options}
      value={selectedValue}
      inputValue={inputValue}
      loading={isLoading || isPending}
      disabled={disabled}
      noOptionsText={
        deferredInputValue.trim().length < 2
          ? t("locations.typeToSearch")
          : t("locations.noResults")
      }
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, value) =>
        option.city === value.city && option.country === value.country
      }
      onInputChange={(_event, value, reason) => {
        if (reason === "reset") {
          setInputValue(value);
          return;
        }

        if (reason === "clear") {
          setInputValue("");
          onSelect(null);
          return;
        }

        setInputValue(value);
      }}
      onChange={(_event, nextValue) => {
        onSelect(nextValue);
        setInputValue(nextValue?.label ?? "");
      }}
      onBlur={() => {
        setInputValue(selectedValue?.label ?? "");
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} sx={{ display: "grid", gap: 0.4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.9 }}>
            <CountryFlag country={option.country} size="1rem" />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {option.city}
            </Typography>
            {option.region ? (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.35 }}>
                {option.region}
              </Typography>
            ) : null}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {option.country}
          </Typography>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={error}
          helperText={error ? helperText : searchError ?? helperText ?? undefined}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <SearchRoundedIcon
                  sx={{ mr: 1, color: "text.secondary", fontSize: 18 }}
                />
                {selectedValue?.country ? <CountryFlag country={selectedValue.country} size="1rem" /> : null}
                {params.InputProps.startAdornment}
              </>
            ),
            endAdornment: (
              <>
                {isLoading || isPending ? (
                  <CircularProgress color="inherit" size={16} sx={{ mr: 1 }} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};
