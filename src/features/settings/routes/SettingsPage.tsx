import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { analyticsRepository } from "../../analytics/analyticsRepository";
import { useInstagramConnectionStatus } from "../../../hooks/useInstagramConnectionStatus";
import type { AvoidConstraint, PreferenceProfile, RightNowExploreSpeed } from "../../../entities/user/model";
import { defaultPreferenceProfile, mergePreferenceProfile } from "../../../services/preferences/preferenceConstraintsService";
import { defaultStoryTravelPreferences, mergeStoryTravelPreferences } from "../../../services/storyTravel/storyTravelDefaults";
import type { StoryTravelDensity, StoryTravelPreferences } from "../../../services/storyTravel/storyTravelTypes";
import { nowIso } from "../../../services/firebase/timestampMapper";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { LocationAutocompleteField } from "../../../shared/ui/LocationAutocompleteField";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { CurrencySelectField } from "../components/CurrencySelectField";
import { InstagramAccountPanel } from "../components/InstagramAccountPanel";
import { ConnectedServicesSection } from "../components/ConnectedServicesSection";

type SettingsDraft = {
  homeCity: string;
  currency: string;
  rightNowExploreSpeed: RightNowExploreSpeed;
  trackAchievements: boolean;
  allowPersonalAnalytics: boolean;
  preferenceProfile: PreferenceProfile;
  storyTravel: StoryTravelPreferences;
};

export const SettingsPage = (): JSX.Element => {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const preferencesMeta = useUserPreferencesStore((state) => state.meta);
  const ensurePreferences = useUserPreferencesStore((state) => state.ensurePreferences);
  const savePreferences = useUserPreferencesStore((state) => state.savePreferences);
  const pushToast = useUiStore((state) => state.pushToast);
  const [draft, setDraft] = useState<SettingsDraft>({
    homeCity: "",
    currency: "USD",
    rightNowExploreSpeed: "balanced",
    trackAchievements: true,
    allowPersonalAnalytics: false,
    preferenceProfile: defaultPreferenceProfile(),
    storyTravel: defaultStoryTravelPreferences(),
  });
  const [saveBusy, setSaveBusy] = useState(false);
  const [avoidKind, setAvoidKind] = useState<AvoidConstraint["type"]>("country");
  const [avoidLine, setAvoidLine] = useState("");
  const [preferLine, setPreferLine] = useState("");
  const isValid = draft.homeCity.trim().length > 0 && draft.currency.trim().length > 0;
  const preferencesLoading = Boolean(user) && preferences === null && preferencesMeta.status === "loading";
  const { connected: instagramConnected, reconnectNeeded, loading: instagramLoading, refresh: refreshInstagram } =
    useInstagramConnectionStatus(user?.id);

  useEffect(() => {
    if (user) {
      void ensurePreferences(user.id);
    }
  }, [ensurePreferences, user]);

  useEffect(() => {
    if (preferences) {
      setDraft({
        homeCity: preferences.homeCity,
        currency: preferences.currency,
        rightNowExploreSpeed: preferences.rightNowExploreSpeed ?? "balanced",
        trackAchievements: preferences.trackAchievements ?? true,
        allowPersonalAnalytics: preferences.allowPersonalAnalytics ?? false,
        preferenceProfile: mergePreferenceProfile(preferences.preferenceProfile),
        storyTravel: mergeStoryTravelPreferences(preferences.storyTravel),
      });
    }
  }, [preferences]);

  const patchDraft = (partial: Partial<SettingsDraft>): void => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const submit = async (): Promise<void> => {
    if (!preferences || !isValid || saveBusy) {
      return;
    }

    setSaveBusy(true);
    try {
      const wasAnalyticsOn = preferences.allowPersonalAnalytics === true;
      const nextAnalyticsOn = draft.allowPersonalAnalytics === true;
      await savePreferences({
        ...preferences,
        homeCity: draft.homeCity,
        currency: draft.currency,
        rightNowExploreSpeed: draft.rightNowExploreSpeed,
        trackAchievements: draft.trackAchievements,
        allowPersonalAnalytics: draft.allowPersonalAnalytics,
        preferenceProfile: mergePreferenceProfile(draft.preferenceProfile),
        storyTravel: mergeStoryTravelPreferences(draft.storyTravel),
        updatedAt: nowIso(),
      });
      if (wasAnalyticsOn && !nextAnalyticsOn && user?.id) {
        analyticsRepository.deleteAnalyticsCacheForUser(user.id);
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const onExploreChange = (event: SelectChangeEvent<RightNowExploreSpeed>): void => {
    patchDraft({ rightNowExploreSpeed: event.target.value as RightNowExploreSpeed });
  };

  const addAvoidRow = (): void => {
    const value = avoidLine.trim();
    if (!value) {
      return;
    }
    setDraft((current) => ({
      ...current,
      preferenceProfile: {
        ...current.preferenceProfile,
        avoid: [...current.preferenceProfile.avoid, { type: avoidKind, value }].slice(0, 32),
      },
    }));
    setAvoidLine("");
  };

  const removeAvoidRow = (index: number): void => {
    setDraft((current) => ({
      ...current,
      preferenceProfile: {
        ...current.preferenceProfile,
        avoid: current.preferenceProfile.avoid.filter((_, i) => i !== index),
      },
    }));
  };

  const addPreferRow = (): void => {
    const value = preferLine.trim();
    if (!value) {
      return;
    }
    setDraft((current) => ({
      ...current,
      preferenceProfile: {
        ...current.preferenceProfile,
        prefer: [...current.preferenceProfile.prefer, value].slice(0, 24),
      },
    }));
    setPreferLine("");
  };

  const removePreferRow = (index: number): void => {
    setDraft((current) => ({
      ...current,
      preferenceProfile: {
        ...current.preferenceProfile,
        prefer: current.preferenceProfile.prefer.filter((_, i) => i !== index),
      },
    }));
  };

  const patchStoryTravel = (partial: Partial<StoryTravelPreferences>): void => {
    setDraft((current) => ({
      ...current,
      storyTravel: { ...current.storyTravel, ...partial },
    }));
  };

  const onStoryDensityChange = (event: SelectChangeEvent<StoryTravelDensity>): void => {
    patchStoryTravel({ density: event.target.value as StoryTravelDensity });
  };

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <GlassPanel sx={{ p: 3 }}>
        {preferencesMeta.status === "error" && preferencesMeta.error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {preferencesMeta.error}
          </Alert>
        ) : null}
        {preferencesLoading ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, py: 6, px: 2 }}>
            <CircularProgress size={36} aria-busy aria-label={t("settings.loadingPreferences")} />
            <Typography variant="body2" color="text.secondary">
              {t("settings.loadingPreferences")}
            </Typography>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 2,
                alignItems: "flex-end",
                justifyContent: "flex-start",
              }}
            >
              <Box sx={{ flex: "1 1 260px", minWidth: 0, maxWidth: { md: "min(100%, 520px)" } }}>
                <LocationAutocompleteField
                  label={t("settings.homeCity")}
                  city={draft.homeCity.split(",")[0]?.trim()}
                  country={draft.homeCity.split(",")[1]?.trim()}
                  onSelect={(value) => patchDraft({ homeCity: value?.label ?? "" })}
                />
              </Box>
              <CurrencySelectField
                homeCityLabel={draft.homeCity}
                value={draft.currency}
                onChange={(code) => patchDraft({ currency: code })}
                locale={preferences?.locale ?? i18n.language}
                label={t("settings.currency")}
              />
              <FormControl sx={{ flex: "1 1 220px", minWidth: 180 }} size="small">
                <InputLabel id="wm-explore-speed">{t("settings.exploreSpeed")}</InputLabel>
                <Select<RightNowExploreSpeed>
                  labelId="wm-explore-speed"
                  label={t("settings.exploreSpeed")}
                  value={draft.rightNowExploreSpeed}
                  onChange={onExploreChange}
                  disabled={saveBusy}
                >
                  <MenuItem value="relaxed">{t("settings.exploreSpeedRelaxed")}</MenuItem>
                  <MenuItem value="balanced">{t("settings.exploreSpeedBalanced")}</MenuItem>
                  <MenuItem value="packed">{t("settings.exploreSpeedPacked")}</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                sx={{ flex: "0 0 auto", px: 3, py: 1.1, minWidth: 120 }}
                disabled={!isValid || saveBusy}
                onClick={() => void submit()}
              >
                {saveBusy ? <CircularProgress size={22} color="inherit" aria-busy aria-label={t("common.save")} /> : t("common.save")}
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, maxWidth: 720 }}>
              {t("settings.exploreSpeedHint")}
            </Typography>
            <Box sx={{ mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "divider", maxWidth: 720 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {t("settings.storyTravelTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                {t("settings.storyTravelSubtitle")}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.storyTravel.enabled}
                    onChange={(e) => patchStoryTravel({ enabled: e.target.checked })}
                    disabled={saveBusy}
                  />
                }
                label={<Typography variant="body2">{t("settings.storyTravelEnabled")}</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.storyTravel.showLiterary}
                    onChange={(e) => patchStoryTravel({ showLiterary: e.target.checked })}
                    disabled={saveBusy || !draft.storyTravel.enabled}
                  />
                }
                label={<Typography variant="body2">{t("settings.storyTravelLiterary")}</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.storyTravel.showFilmSeries}
                    onChange={(e) => patchStoryTravel({ showFilmSeries: e.target.checked })}
                    disabled={saveBusy || !draft.storyTravel.enabled}
                  />
                }
                label={<Typography variant="body2">{t("settings.storyTravelFilm")}</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.storyTravel.showVibeMatches}
                    onChange={(e) => patchStoryTravel({ showVibeMatches: e.target.checked })}
                    disabled={saveBusy || !draft.storyTravel.enabled}
                  />
                }
                label={<Typography variant="body2">{t("settings.storyTravelVibe")}</Typography>}
              />
              <FormControl size="small" sx={{ minWidth: 220, mt: 1.5 }} disabled={saveBusy || !draft.storyTravel.enabled}>
                <InputLabel id="wm-story-density">{t("settings.storyTravelDensity")}</InputLabel>
                <Select<StoryTravelDensity>
                  labelId="wm-story-density"
                  label={t("settings.storyTravelDensity")}
                  value={draft.storyTravel.density}
                  onChange={onStoryDensityChange}
                >
                  <MenuItem value="none">{t("settings.storyTravelDensityNone")}</MenuItem>
                  <MenuItem value="subtle">{t("settings.storyTravelDensitySubtle")}</MenuItem>
                  <MenuItem value="balanced">{t("settings.storyTravelDensityBalanced")}</MenuItem>
                  <MenuItem value="themed">{t("settings.storyTravelDensityThemed")}</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "divider", maxWidth: 720 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {t("settings.travelBlocksTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                {t("settings.travelBlocksSubtitle")}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                {t("settings.travelBlocksExamples")}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mb: 1.5 }}>
                {draft.preferenceProfile.avoid.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("settings.travelBlocksEmptyAvoid")}
                  </Typography>
                ) : (
                  draft.preferenceProfile.avoid.map((row, index) => (
                    <Chip
                      key={`${row.type}-${row.value}-${index}`}
                      label={`${row.type}: ${row.value}`}
                      onDelete={() => removeAvoidRow(index)}
                      variant="outlined"
                    />
                  ))
                )}
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-end", mb: 2 }}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel id="wm-avoid-kind">{t("settings.travelBlocksAvoidKind")}</InputLabel>
                  <Select<AvoidConstraint["type"]>
                    labelId="wm-avoid-kind"
                    label={t("settings.travelBlocksAvoidKind")}
                    value={avoidKind}
                    onChange={(e) => setAvoidKind(e.target.value as AvoidConstraint["type"])}
                    disabled={saveBusy}
                  >
                    <MenuItem value="country">{t("settings.travelBlocksKindCountry")}</MenuItem>
                    <MenuItem value="city">{t("settings.travelBlocksKindCity")}</MenuItem>
                    <MenuItem value="region">{t("settings.travelBlocksKindRegion")}</MenuItem>
                    <MenuItem value="category">{t("settings.travelBlocksKindCategory")}</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label={t("settings.travelBlocksAvoidValue")}
                  value={avoidLine}
                  onChange={(e) => setAvoidLine(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAvoidRow();
                    }
                  }}
                  disabled={saveBusy || draft.preferenceProfile.avoid.length >= 32}
                  sx={{ flex: "1 1 200px", minWidth: 0, maxWidth: 360 }}
                />
                <Button type="button" variant="outlined" onClick={addAvoidRow} disabled={saveBusy || !avoidLine.trim() || draft.preferenceProfile.avoid.length >= 32}>
                  {t("settings.travelBlocksAddAvoid")}
                </Button>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                {t("settings.travelBlocksPreferHeading")}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                {t("settings.travelBlocksPreferHint")}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
                {draft.preferenceProfile.prefer.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("settings.travelBlocksEmptyPrefer")}
                  </Typography>
                ) : (
                  draft.preferenceProfile.prefer.map((line, index) => (
                    <Chip
                      key={`${line}-${index}`}
                      label={line}
                      onDelete={() => removePreferRow(index)}
                    />
                  ))
                )}
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-end" }}>
                <TextField
                  size="small"
                  label={t("settings.travelBlocksPreferValue")}
                  value={preferLine}
                  onChange={(e) => setPreferLine(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPreferRow();
                    }
                  }}
                  disabled={saveBusy || draft.preferenceProfile.prefer.length >= 24}
                  sx={{ flex: "1 1 220px", minWidth: 0, maxWidth: 420 }}
                />
                <Button type="button" variant="outlined" onClick={addPreferRow} disabled={saveBusy || !preferLine.trim() || draft.preferenceProfile.prefer.length >= 24}>
                  {t("settings.travelBlocksAddPrefer")}
                </Button>
              </Box>
            </Box>
            <Box sx={{ mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "divider", maxWidth: 720 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.trackAchievements}
                    onChange={(e) => patchDraft({ trackAchievements: e.target.checked })}
                    disabled={saveBusy}
                    inputProps={{ "aria-label": t("settings.trackAchievements") }}
                  />
                }
                label={<Typography variant="body2">{t("settings.trackAchievements")}</Typography>}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {t("settings.trackAchievementsHint")}
              </Typography>
            </Box>
            <Box sx={{ mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "divider", maxWidth: 720 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.allowPersonalAnalytics}
                    onChange={(e) => patchDraft({ allowPersonalAnalytics: e.target.checked })}
                    disabled={saveBusy}
                    inputProps={{ "aria-label": t("settings.allowPersonalAnalytics") }}
                  />
                }
                label={<Typography variant="body2">{t("settings.allowPersonalAnalytics")}</Typography>}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {t("settings.allowPersonalAnalyticsHint")}
              </Typography>
              <Box sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                <Button
                  type="button"
                  variant="outlined"
                  color="warning"
                  disabled={saveBusy || !draft.allowPersonalAnalytics || !user?.id}
                  onClick={() => {
                    if (!user?.id) {
                      return;
                    }
                    analyticsRepository.deleteAnalyticsCacheForUser(user.id);
                    pushToast({ message: t("settings.analyticsCacheClearedToast"), tone: "success" });
                  }}
                >
                  {t("settings.deleteAnalyticsCache")}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ flex: "1 1 220px", minWidth: 0 }}>
                  {t("settings.deleteAnalyticsCacheHint")}
                </Typography>
              </Box>
            </Box>
          </>
        )}
      </GlassPanel>

      <ConnectedServicesSection userId={user?.id} />

      <GlassPanel sx={{ p: 3, display: "grid", gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {t("settings.privacySectionTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings.privacySectionSubtitle")}
        </Typography>
        <Box>
          <Button component={Link} to="/settings/privacy" variant="outlined">
            {t("settings.openPrivacy")}
          </Button>
        </Box>
      </GlassPanel>

      <GlassPanel sx={{ p: 3 }}>
        <InstagramAccountPanel
          connected={instagramConnected}
          reconnectNeeded={reconnectNeeded}
          loading={instagramLoading}
          onConnectionChanged={refreshInstagram}
        />
      </GlassPanel>
    </Box>
  );
};
