import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import { Alert, Avatar, Box, Button, Chip, Grid, MenuItem, TextField, Typography } from "@mui/material";
import type { RightNowSpendTier } from "../../../services/ai/promptBuilders/localScenarioPromptBuilder";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { usePrivacySettingsStore } from "../../../app/store/usePrivacySettingsStore";
import { useLocalScenariosStore } from "../../../app/store/useLocalScenariosStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { useTravelMemoryStore } from "../../../app/store/useTravelMemoryStore";
import { usePlaceMemoryStore } from "../../../app/store/usePlaceMemoryStore";
import { useFriendsStore } from "../../../app/store/useFriendsStore";
import type { Friend, RightNowSocialContext, RightNowSocialMode } from "../../../entities/friend/model";
import { ScenarioCardsGridSkeleton } from "../../../shared/ui/skeletons/ScenarioCardsGridSkeleton";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { AiProgressPanel } from "../../../shared/ui/AiProgressPanel";
import { publicGeoProvider } from "../../../services/providers/publicGeoProvider";
import { createDefaultPrivacySettings } from "../../privacy/privacySettings.types";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { ScenarioSummaryCard } from "../components/ScenarioSummaryCard";
import { PlanningContextWidgets } from "../../planning-context/components/PlanningContextWidgets";
import { resolvePlanningLocations } from "../../planning-context/resolvePlanningLocations";
import {
  computeGroupMidpoint,
  createCurrentUserParticipant,
  createParticipantFromFriend,
  getFriendsInSameCity,
} from "../lib/rightNowSocial";

const vibeOptions = [
  { value: "coffee + gallery + walk", labelKey: "local.vibes.coffeeGallery" },
  { value: "cinema + dessert", labelKey: "local.vibes.cinemaDessert" },
  { value: "indoor rainy-day plan", labelKey: "local.vibes.rainyDay" },
  { value: "cheap social evening", labelKey: "local.vibes.cheapSocial" },
  { value: "date idea nearby", labelKey: "local.vibes.dateIdea" },
  { value: "2-hour culture route", labelKey: "local.vibes.cultureRoute" },
] as const;

interface CurrentLocationState {
  label: string;
  latitude?: number;
  longitude?: number;
  status: "idle" | "locating" | "ready" | "error" | "consent_needed";
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

const parseCityCountryFromLabel = (label: string): { city?: string; country?: string } => {
  const [cityRaw, countryRaw] = label.split(",").map((part) => part.trim());
  return {
    city: cityRaw || undefined,
    country: countryRaw || undefined,
  };
};

export const LocalScenarioPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const privacySettings = usePrivacySettingsStore((state) => state.settings);
  const privacyMeta = usePrivacySettingsStore((state) => state.meta);
  const ensurePrivacySettings = usePrivacySettingsStore((state) => state.ensurePrivacySettings);
  const savePrivacySettings = usePrivacySettingsStore((state) => state.savePrivacySettings);
  const generateScenarios = useLocalScenariosStore((state) => state.generateScenarios);
  const saveScenario = useLocalScenariosStore((state) => state.saveScenario);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const ensureTravelMemories = useTravelMemoryStore((state) => state.ensureMemories);
  const travelMemoriesById = useTravelMemoryStore((state) => state.memoriesById);
  const travelMemoryIds = useTravelMemoryStore((state) => state.memoryIds);
  const ensurePlaceMemories = usePlaceMemoryStore((state) => state.ensureMemories);
  const placeMemoriesById = usePlaceMemoryStore((state) => state.memoriesById);
  const placeMemoryIds = usePlaceMemoryStore((state) => state.memoryIds);
  const friendIds = useFriendsStore((state) => state.friendIds);
  const friendsById = useFriendsStore((state) => state.friendsById);
  const ensureFriends = useFriendsStore((state) => state.ensureFriends);
  const scenarioIds = useLocalScenariosStore((state) => state.scenarioIds);
  const scenariosById = useLocalScenariosStore((state) => state.scenariosById);
  const meta = useLocalScenariosStore((state) => state.flowMeta);
  const progressStep = useLocalScenariosStore((state) => state.progressStep);
  const expectedScenarioCount = useLocalScenariosStore((state) => state.expectedScenarioCount);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationState>({ label: "", status: "idle" });
  const [locationConsentOpen, setLocationConsentOpen] = useState(false);
  const [locationConsentBusy, setLocationConsentBusy] = useState(false);
  const initialLocationRequested = useRef(false);
  const [vibe, setVibe] = useState("coffee + gallery + walk");
  const [availableHours, setAvailableHours] = useState(2);
  const [availableMinuteRemainder, setAvailableMinuteRemainder] = useState(30);
  const [spendTier, setSpendTier] = useState<RightNowSpendTier>("flexible");
  const [socialMode, setSocialMode] = useState<RightNowSocialMode>("solo");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchGeolocationIntoState = useCallback((): void => {
    setCurrentLocation({ label: t("local.locating"), status: "locating" });
    if (!navigator.geolocation) {
      setCurrentLocation({ label: t("local.locationUnavailable"), status: "error" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        void publicGeoProvider
          .reverseGeocode(latitude, longitude)
          .then((geoPoint) => setCurrentLocation({ label: geoPoint.label, latitude, longitude, status: "ready" }))
          .catch(() => setCurrentLocation({ label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude, status: "ready" }));
      },
      () => setCurrentLocation({ label: t("local.locationUnavailable"), status: "error" }),
    );
  }, [t]);

  const requestLocation = useCallback((): void => {
    if (!privacySettings?.allowLocationDuringTrip) {
      setCurrentLocation({ label: t("local.privacy.consentNeededLabel"), status: "consent_needed" });
      return;
    }
    fetchGeolocationIntoState();
  }, [fetchGeolocationIntoState, privacySettings?.allowLocationDuringTrip, t]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    void ensurePrivacySettings(user.id);
  }, [ensurePrivacySettings, user?.id]);

  useEffect(() => {
    if (!user?.id || privacyMeta.status !== "success" || initialLocationRequested.current) {
      return;
    }
    initialLocationRequested.current = true;
    if (privacySettings?.allowLocationDuringTrip) {
      fetchGeolocationIntoState();
    } else {
      setCurrentLocation({ label: t("local.privacy.consentNeededLabel"), status: "consent_needed" });
    }
  }, [fetchGeolocationIntoState, privacyMeta.status, privacySettings?.allowLocationDuringTrip, t, user?.id]);

  const onLocationButton = (): void => {
    if (privacySettings?.allowLocationDuringTrip) {
      requestLocation();
      return;
    }
    setLocationConsentOpen(true);
  };

  const confirmLocationConsent = async (): Promise<void> => {
    if (!user?.id) {
      return;
    }
    setLocationConsentBusy(true);
    try {
      const base = privacySettings ?? createDefaultPrivacySettings(user.id);
      await savePrivacySettings({ ...base, userId: user.id, allowLocationDuringTrip: true });
      setLocationConsentOpen(false);
      fetchGeolocationIntoState();
    } finally {
      setLocationConsentBusy(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    void ensureTravelMemories(user.id);
    void ensurePlaceMemories(user.id);
    void ensureFriends(user.id);
  }, [ensureFriends, ensurePlaceMemories, ensureTravelMemories, user?.id]);

  const deferredScenarioIds = useDeferredValue(scenarioIds);
  const scenarios = deferredScenarioIds.map((scenarioId) => scenariosById[scenarioId]).filter((scenario): scenario is NonNullable<typeof scenario> => Boolean(scenario));
  const travelMemories = useMemo(
    () => travelMemoryIds.map((id) => travelMemoriesById[id]).filter((memory): memory is NonNullable<typeof memory> => Boolean(memory)),
    [travelMemoriesById, travelMemoryIds],
  );
  const placeMemories = useMemo(
    () => placeMemoryIds.map((id) => placeMemoriesById[id]).filter((memory): memory is NonNullable<typeof memory> => Boolean(memory)),
    [placeMemoriesById, placeMemoryIds],
  );
  const friends = useMemo(
    () => friendIds.map((id) => friendsById[id]).filter((item): item is Friend => Boolean(item)),
    [friendIds, friendsById],
  );
  const parsedLocation = useMemo(() => parseCityCountryFromLabel(currentLocation.label), [currentLocation.label]);
  const sameCityFriends = useMemo(
    () => (parsedLocation.city ? getFriendsInSameCity(parsedLocation.city, friends) : []),
    [friends, parsedLocation.city],
  );
  const selectedFriends = useMemo(() => {
    const selected = sameCityFriends.filter((friend) => selectedFriendIds.includes(friend.id));
    if (socialMode === "duo") {
      return selected.slice(0, 1);
    }
    return selected;
  }, [sameCityFriends, selectedFriendIds, socialMode]);
  const socialContext = useMemo<RightNowSocialContext | undefined>(() => {
    if (socialMode === "solo") {
      return {
        mode: "solo",
        participants: [
          createCurrentUserParticipant({
            userId: user?.id,
            userName: user?.displayName,
            city: parsedLocation.city ?? currentLocation.label,
            country: parsedLocation.country,
            address: currentLocation.label,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }),
        ],
        participantCount: 1,
        locationStrategy: {
          preferred: "near_me",
          allowCitywideInterestingDetours: false,
        },
      };
    }
    const me = createCurrentUserParticipant({
      userId: user?.id,
      userName: user?.displayName,
      city: parsedLocation.city ?? currentLocation.label,
      country: parsedLocation.country,
      address: currentLocation.label,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    });
    const friendParticipants = selectedFriends.map(createParticipantFromFriend);
    const participants = [me, ...friendParticipants];
    const midpoint = computeGroupMidpoint(participants);
    return {
      mode: socialMode,
      participants,
      participantCount: participants.length,
      locationStrategy: {
        preferred: midpoint ? "midpoint" : "citywide",
        allowCitywideInterestingDetours: true,
        midpoint,
      },
    };
  }, [
    socialMode,
    user?.id,
    user?.displayName,
    parsedLocation.city,
    parsedLocation.country,
    currentLocation.label,
    currentLocation.latitude,
    currentLocation.longitude,
    selectedFriends,
  ]);
  const groupPeopleLabel = useMemo(() => {
    if (selectedFriends.length === 0) {
      return t("local.social.someone");
    }
    const shown = selectedFriends.slice(0, 2).map((item) => item.name);
    const hiddenCount = Math.max(0, selectedFriends.length - shown.length);
    if (hiddenCount === 0) {
      return shown.join(", ");
    }
    return `${shown.join(", ")} ${t("local.social.andOthers", { count: hiddenCount })}`;
  }, [selectedFriends, t]);

  useEffect(() => {
    if (socialMode === "solo") {
      if (selectedFriendIds.length > 0) {
        setSelectedFriendIds([]);
      }
      return;
    }
    const allowedIds = new Set(sameCityFriends.map((friend) => friend.id));
    const filtered = selectedFriendIds.filter((id) => allowedIds.has(id));
    if (socialMode === "duo" && filtered.length > 1) {
      setSelectedFriendIds(filtered.slice(0, 1));
      return;
    }
    if (filtered.length !== selectedFriendIds.length) {
      setSelectedFriendIds(filtered);
    }
  }, [sameCityFriends, selectedFriendIds, socialMode]);

  const availableMinutes = availableHours * 60 + availableMinuteRemainder;
  const rightNowWidgetLocations = useMemo(
    () =>
      resolvePlanningLocations("right_now", {
        locationLabel: currentLocation.label,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      }),
    [currentLocation.label, currentLocation.latitude, currentLocation.longitude],
  );
  const isGenerating = meta.status === "loading";
  const generatingScenarioSkeletonCount = Math.min(Math.max(expectedScenarioCount || 3, 1), 6);
  const duoSelectionValid = socialMode !== "duo" || selectedFriends.length === 1;
  const groupSelectionValid = socialMode !== "group" || selectedFriends.length > 0;
  const isRequestValid =
    currentLocation.status === "ready" &&
    currentLocation.latitude !== undefined &&
    currentLocation.longitude !== undefined &&
    vibe.trim().length > 0 &&
    availableMinutes >= 30 &&
    duoSelectionValid &&
    groupSelectionValid;

  const validateRequest = (): string | null => {
    if (currentLocation.status === "idle") {
      return t("local.errors.locationPending");
    }
    if (currentLocation.status === "consent_needed") {
      return t("local.errors.locationConsent");
    }
    if (currentLocation.status === "locating") {
      return t("local.errors.locationPending");
    }
    if (currentLocation.status !== "ready" || currentLocation.latitude === undefined || currentLocation.longitude === undefined) {
      return t("local.errors.locationRequired");
    }
    if (vibe.trim().length === 0) {
      return t("local.errors.vibeRequired");
    }
    if (availableMinutes < 30) {
      return t("local.errors.timeTooShort");
    }
    if (socialMode === "duo" && selectedFriends.length !== 1) {
      return t("local.social.duoValidation");
    }
    if (socialMode === "group" && selectedFriends.length === 0) {
      return t("local.social.groupValidation");
    }
    return null;
  };
  const progressStages = useMemo(
    () => [
      { key: "locating_precisely", label: t("local.progress.locating_precisely") },
      { key: "checking_weather", label: t("local.progress.checking_weather") },
      { key: "finding_nearby_places", label: t("local.progress.finding_nearby_places") },
      { key: "estimating_movement", label: t("local.progress.estimating_movement") },
      { key: "composing_scenarios", label: t("local.progress.composing_scenarios") },
      { key: "refining_with_ai", label: t("local.progress.refining_with_ai") },
      { key: "polishing_itinerary", label: t("local.progress.polishing_itinerary") },
    ],
    [t],
  );
  const progressValue = useMemo(() => {
    if (!progressStep) {
      return 0;
    }

    const activeIndex = progressStages.findIndex((item) => item.key === progressStep);
    const stageProgress = activeIndex < 0 ? 0 : ((activeIndex + 1) / progressStages.length) * 82;
    const batchProgress = expectedScenarioCount > 0 ? Math.min(18, (scenarios.length / expectedScenarioCount) * 18) : 0;
    return Math.min(100, stageProgress + batchProgress);
  }, [expectedScenarioCount, progressStages, progressStep, scenarios.length]);

  const submit = async (): Promise<void> => {
    const nextValidationError = validateRequest();
    setValidationError(nextValidationError);
    if (nextValidationError) {
      return;
    }

    await generateScenarios({
      userId: user?.id,
      locationLabel: currentLocation.label,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      vibe,
      availableMinutes,
      rightNowSpendTier: spendTier,
      userPreferences: preferences,
      travelMemories,
      placeMemories,
      socialContext,
    });
  };

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("local.title")} subtitle={t("local.subtitle")} />
      <GlassPanel elevated sx={{ p: { xs: 2.5, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gap: 2,
            alignItems: "center",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              md: "minmax(0, 1.4fr) minmax(0, 1fr) 100px 100px minmax(0, 0.9fr) minmax(0, auto)",
            },
          }}
        >
          <TextField
            fullWidth
            label={t("local.location")}
            value={currentLocation.label}
            InputProps={{ readOnly: true }}
            error={currentLocation.status === "error"}
            helperText={
              currentLocation.status === "error"
                ? t("local.noPermission")
                : currentLocation.status === "consent_needed"
                  ? t("local.privacy.consentNeededHelper")
                  : undefined
            }
            sx={{ gridColumn: { xs: "1 / -1", sm: "1 / -1", md: "auto" } }}
          />
          <TextField
            select
            fullWidth
            label={t("local.vibe")}
            value={vibe}
            onChange={(event) => setVibe(event.target.value)}
            sx={{ gridColumn: { xs: "1 / -1", sm: "span 2", md: "auto" } }}
          >
            {vibeOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth label={t("local.hours")} value={availableHours} onChange={(event) => setAvailableHours(Number(event.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6, 8].map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth label={t("local.minutes")} value={availableMinuteRemainder} onChange={(event) => setAvailableMinuteRemainder(Number(event.target.value))}>
            {[0, 15, 30, 45].map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label={t("local.spendTier")}
            value={spendTier}
            onChange={(event) => setSpendTier(event.target.value as RightNowSpendTier)}
            sx={{ gridColumn: { xs: "1 / -1", sm: "span 2", md: "auto" } }}
          >
            <MenuItem value="free">{t("local.spendTierFree")}</MenuItem>
            <MenuItem value="low">{t("local.spendTierLow")}</MenuItem>
            <MenuItem value="flexible">{t("local.spendTierFlexible")}</MenuItem>
          </TextField>
          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridColumn: { xs: "1 / -1", md: "1 / span 5" },
              border: "1px solid rgba(183, 237, 226, 0.16)",
              borderRadius: 2,
              p: 1.2,
              background: "rgba(4, 14, 20, 0.36)",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t("local.social.title")}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
              {(["solo", "duo", "group"] as const).map((mode) => (
                <Chip
                  key={mode}
                  label={t(`local.social.mode.${mode}`)}
                  clickable
                  color={socialMode === mode ? "primary" : "default"}
                  variant={socialMode === mode ? "filled" : "outlined"}
                  onClick={() => setSocialMode(mode)}
                />
              ))}
            </Box>
            {socialMode !== "solo" ? (
              <Box sx={{ display: "grid", gap: 0.7 }}>
                {friends.length === 0 ? (
                  <Alert
                    severity="info"
                    action={
                      <Button component={Link} to="/friends" color="inherit" size="small">
                        {t("local.social.openFriends")}
                      </Button>
                    }
                  >
                    {t("local.social.noFriends")}
                  </Alert>
                ) : sameCityFriends.length === 0 ? (
                  <Alert severity="info">{t("local.social.noSameCityFriends")}</Alert>
                ) : (
                  <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                    {sameCityFriends.map((friend) => {
                      const selected = selectedFriendIds.includes(friend.id);
                      return (
                        <Button
                          key={friend.id}
                          variant={selected ? "contained" : "outlined"}
                          color={selected ? "primary" : "inherit"}
                          onClick={() => {
                            if (socialMode === "duo") {
                              setSelectedFriendIds(selected ? [] : [friend.id]);
                              return;
                            }
                            setSelectedFriendIds((current) =>
                              selected ? current.filter((id) => id !== friend.id) : [...current, friend.id],
                            );
                          }}
                          sx={{ textTransform: "none", gap: 0.8, pl: 0.8, pr: 1.1 }}
                          startIcon={
                            <Avatar src={friend.avatarUrl} alt={friend.name} sx={{ width: 22, height: 22, fontSize: 11 }}>
                              {initials(friend.name)}
                            </Avatar>
                          }
                        >
                          {friend.name}
                        </Button>
                      );
                    })}
                  </Box>
                )}
              </Box>
            ) : null}
            <Typography variant="caption" color="text.secondary">
              {socialMode === "solo"
                ? t("local.social.summary.solo", { city: parsedLocation.city ?? currentLocation.label })
                : socialMode === "duo"
                  ? t("local.social.summary.duo", {
                      city: parsedLocation.city ?? currentLocation.label,
                      friendName: selectedFriends[0]?.name ?? t("local.social.someone"),
                    })
                  : t("local.social.summary.group", {
                      city: parsedLocation.city ?? currentLocation.label,
                      people: groupPeopleLabel,
                    })}
            </Typography>
            {socialContext?.locationStrategy.preferred === "midpoint" ? (
              <Typography variant="caption" color="text.secondary">
                {t("local.social.midpointHint")}
              </Typography>
            ) : null}
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: 1,
              flexWrap: "wrap",
              justifyContent: { md: "flex-end" },
              gridColumn: { xs: "1 / -1", md: "auto" },
            }}
          >
            <Button variant="outlined" startIcon={<MyLocationOutlinedIcon />} onClick={onLocationButton}>
              {privacySettings?.allowLocationDuringTrip ? t("local.permission") : t("local.privacy.allowLocationCta")}
            </Button>
            <Button variant="contained" disabled={!isRequestValid || isGenerating} onClick={() => void submit()}>
              {isGenerating ? t("local.generating") : t("local.generate")}
            </Button>
          </Box>
        </Box>
      </GlassPanel>
      <PlanningContextWidgets flow="right_now" locations={rightNowWidgetLocations} />
      {validationError ? <Alert severity="warning">{validationError}</Alert> : null}
      <ConfirmActionDialog
        open={locationConsentOpen}
        title={t("local.privacy.consentDialogTitle")}
        description={t("local.privacy.consentDialogBody")}
        confirmLabel={t("local.privacy.consentDialogConfirm")}
        cancelLabel={t("common.cancel")}
        isPending={locationConsentBusy}
        onCancel={() => setLocationConsentOpen(false)}
        onConfirm={() => void confirmLocationConsent()}
      />
      {meta.status === "error" && meta.error ? (
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
          {meta.error}
        </Alert>
      ) : null}
      {isGenerating && progressStep ? (
        <AiProgressPanel
          title={t("local.generatingPanelTitle")}
          subtitle={t(`local.progress.${progressStep}`)}
          progress={progressValue}
          activeKey={progressStep}
          stages={progressStages}
          trailingLabel={
            expectedScenarioCount > 0
              ? t("local.progress.loadedCount", { shown: scenarios.length, total: expectedScenarioCount })
              : undefined
          }
        />
      ) : null}
      {meta.status === "success" && scenarios.length === 0 ? (
        <Alert severity="info">{t("local.errors.noResults")}</Alert>
      ) : null}
      {isGenerating && scenarios.length === 0 ? (
        <ScenarioCardsGridSkeleton count={generatingScenarioSkeletonCount} previewVariant="scenarioCard" />
      ) : null}
      <Grid container spacing={2}>
        {scenarios.map((scenario) => (
          <Grid item xs={12} sm={6} lg={4} key={scenario.id}>
            <ScenarioSummaryCard
              scenario={scenario}
              saveLabel={t("local.save")}
              onSave={user ? () => void saveScenario(user.id, scenario.id) : undefined}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
