import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeFoodIntentLabel } from "../../../services/food/foodIntentNormalization";
import {
  deriveFoodInterestsFromPreferences,
  foodPreferenceDedupeKey,
  MAX_FOOD_PREFERENCES,
  type FoodPreference,
} from "../../../services/food/foodPreferenceTypes";
import { searchRestaurantsForFoodPreferences } from "../../../services/food/restaurantSearchService";
import type { PlaceCandidate } from "../../../services/places/placeTypes";

export type FoodPreferencesFieldProps = {
  preferences: FoodPreference[];
  onChange: (next: FoodPreference[], derivedFoodInterests: string[]) => void;
  destinationCity: string;
  destinationCountry: string;
};

type EntryMode = "restaurant" | "intent";

export const FoodPreferencesField = ({
  preferences,
  onChange,
  destinationCity,
  destinationCountry,
}: FoodPreferencesFieldProps): JSX.Element => {
  const { t } = useTranslation();
  const [entryMode, setEntryMode] = useState<EntryMode>("restaurant");
  const [restaurantInput, setRestaurantInput] = useState("");
  const [restaurantOptions, setRestaurantOptions] = useState<PlaceCandidate[]>([]);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [intentDraft, setIntentDraft] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextLabel = useMemo(() => [destinationCity, destinationCountry].filter(Boolean).join(", "), [destinationCity, destinationCountry]);

  const intentPreviewTags = useMemo(() => normalizeFoodIntentLabel(intentDraft), [intentDraft]);

  const pushPrefs = (next: FoodPreference[]): void => {
    onChange(next, deriveFoodInterestsFromPreferences(next));
  };

  const keysInUse = useMemo(() => new Set(preferences.map(foodPreferenceDedupeKey)), [preferences]);

  const runRestaurantSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setRestaurantOptions([]);
        return;
      }
      setRestaurantLoading(true);
      try {
        const rows = await searchRestaurantsForFoodPreferences({
          query: trimmed,
          city: destinationCity.trim() || undefined,
          country: destinationCountry.trim() || undefined,
        });
        setRestaurantOptions(rows);
      } finally {
        setRestaurantLoading(false);
      }
    },
    [destinationCity, destinationCountry],
  );

  useEffect(() => {
    if (entryMode !== "restaurant") {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void runRestaurantSearch(restaurantInput);
    }, 400);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [entryMode, restaurantInput, runRestaurantSearch]);

  const addRestaurant = (place: PlaceCandidate): void => {
    if (preferences.length >= MAX_FOOD_PREFERENCES) {
      return;
    }
    const nextPref: FoodPreference = { type: "restaurant", place };
    const key = foodPreferenceDedupeKey(nextPref);
    if (keysInUse.has(key)) {
      return;
    }
    pushPrefs([...preferences, nextPref]);
    setRestaurantInput("");
    setRestaurantOptions([]);
  };

  const addIntent = (): void => {
    const label = intentDraft.trim();
    if (label.length < 2 || preferences.length >= MAX_FOOD_PREFERENCES) {
      return;
    }
    const normalizedTags = normalizeFoodIntentLabel(label);
    if (normalizedTags.length === 0) {
      return;
    }
    const nextPref: FoodPreference = { type: "intent", label, normalizedTags };
    const key = foodPreferenceDedupeKey(nextPref);
    if (keysInUse.has(key)) {
      return;
    }
    pushPrefs([...preferences, nextPref]);
    setIntentDraft("");
  };

  const removeAt = (index: number): void => {
    pushPrefs(preferences.filter((_, i) => i !== index));
  };

  return (
    <Box sx={{ display: "grid", gap: 1.75 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {t("wizard.foodPreferences.title")}
      </Typography>
      <Typography variant="caption" color="text.disabled">
        {t("wizard.foodPreferences.subtitle")}
      </Typography>

      {preferences.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {preferences.map((p, index) => (
            <Chip
              key={`${foodPreferenceDedupeKey(p)}-${index}`}
              label={p.type === "restaurant" ? p.place.name : `${p.label} · ${p.normalizedTags.join(", ")}`}
              onDelete={() => removeAt(index)}
              size="small"
              variant={p.type === "restaurant" ? "filled" : "outlined"}
              color={p.type === "restaurant" ? "secondary" : "default"}
            />
          ))}
        </Box>
      ) : null}

      <ToggleButtonGroup
        exclusive
        size="small"
        value={entryMode}
        onChange={(_e, v) => {
          if (v) {
            setEntryMode(v as EntryMode);
          }
        }}
        sx={{ alignSelf: "flex-start" }}
      >
        <ToggleButton value="restaurant">{t("wizard.foodPreferences.modeRestaurant")}</ToggleButton>
        <ToggleButton value="intent">{t("wizard.foodPreferences.modeIntent")}</ToggleButton>
      </ToggleButtonGroup>

      {entryMode === "restaurant" ? (
        <Autocomplete<PlaceCandidate, false, false>
          disabled={preferences.length >= MAX_FOOD_PREFERENCES}
          options={restaurantOptions}
          loading={restaurantLoading}
          filterOptions={(x) => x}
          getOptionLabel={(opt) => opt.name}
          value={null}
          inputValue={restaurantInput}
          onInputChange={(_e, v) => setRestaurantInput(v)}
          onChange={(_e, v) => {
            if (v) {
              addRestaurant(v);
            }
          }}
          renderOption={(props, option) => (
            <li {...props} key={option.id}>
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
                  <RestaurantOutlinedIcon fontSize="small" color="disabled" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                    {option.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {[option.city, option.country].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t("wizard.foodPreferences.searchRestaurant")}
              placeholder={t("wizard.foodPreferences.searchRestaurantPlaceholder")}
              helperText={
                preferences.length >= MAX_FOOD_PREFERENCES
                  ? t("wizard.foodPreferences.maxReached", { max: MAX_FOOD_PREFERENCES })
                  : contextLabel
                    ? t("wizard.foodPreferences.helperCity", { place: contextLabel })
                    : t("wizard.foodPreferences.helperNoCity")
              }
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {restaurantLoading ? <CircularProgress color="inherit" size={18} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
          ListboxProps={{ sx: { maxHeight: 320 } }}
          sx={{ "& .MuiAutocomplete-popper": { zIndex: 1400 } }}
        />
      ) : (
        <Box sx={{ display: "grid", gap: 1 }}>
          <TextField
            fullWidth
            label={t("wizard.foodPreferences.intentLabel")}
            placeholder={t("wizard.foodPreferences.intentPlaceholder")}
            value={intentDraft}
            onChange={(e) => setIntentDraft(e.target.value)}
            disabled={preferences.length >= MAX_FOOD_PREFERENCES}
            helperText={t("wizard.foodPreferences.intentHelper")}
          />
          {intentPreviewTags.length > 0 ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
              <Typography variant="caption" color="text.secondary">
                {t("wizard.foodPreferences.tagsPreview")}
              </Typography>
              {intentPreviewTags.map((tag) => (
                <Chip key={tag} size="small" label={tag} variant="outlined" />
              ))}
            </Box>
          ) : null}
          <Button variant="contained" size="small" sx={{ alignSelf: "flex-start" }} onClick={addIntent} disabled={intentDraft.trim().length < 2}>
            {t("wizard.foodPreferences.addIntent")}
          </Button>
        </Box>
      )}
    </Box>
  );
};
