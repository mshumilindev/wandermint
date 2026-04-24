import { Box, Button, Grid, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { nowIso } from "../../../services/firebase/timestampMapper";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { LocationAutocompleteField } from "../../../shared/ui/LocationAutocompleteField";
import { SectionHeader } from "../../../shared/ui/SectionHeader";

export const SettingsPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const ensurePreferences = useUserPreferencesStore((state) => state.ensurePreferences);
  const savePreferences = useUserPreferencesStore((state) => state.savePreferences);
  const [draft, setDraft] = useState({ homeCity: "", currency: "USD" });
  const isValid = draft.homeCity.trim().length > 0 && draft.currency.trim().length > 0;

  useEffect(() => {
    if (user) {
      void ensurePreferences(user.id);
    }
  }, [ensurePreferences, user]);

  useEffect(() => {
    if (preferences) {
      setDraft({ homeCity: preferences.homeCity, currency: preferences.currency });
    }
  }, [preferences]);

  const patchDraft = (field: "homeCity" | "currency", value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const submit = async (): Promise<void> => {
    if (!preferences || !isValid) {
      return;
    }

    await savePreferences({ ...preferences, homeCity: draft.homeCity, currency: draft.currency, updatedAt: nowIso() });
  };

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <GlassPanel sx={{ p: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LocationAutocompleteField
              label={t("settings.homeCity")}
              city={draft.homeCity.split(",")[0]?.trim()}
              country={draft.homeCity.split(",")[1]?.trim()}
              helperText=" "
              onSelect={(value) => patchDraft("homeCity", value?.label ?? "")}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField fullWidth label={t("settings.currency")} value={draft.currency} onChange={(event) => patchDraft("currency", event.target.value)} />
          </Grid>
          <Grid item xs={12} md={3}>
            <Button fullWidth variant="contained" sx={{ height: "100%" }} disabled={!isValid} onClick={() => void submit()}>
              {t("common.save")}
            </Button>
          </Grid>
        </Grid>
      </GlassPanel>
    </Box>
  );
};
