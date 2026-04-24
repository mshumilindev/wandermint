import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import { Alert, Box, Button, Grid, MenuItem, TextField } from "@mui/material";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useLocalScenariosStore } from "../../../app/store/useLocalScenariosStore";
import { LoadingState } from "../../../shared/ui/LoadingState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { AiProgressPanel } from "../../../shared/ui/AiProgressPanel";
import { publicGeoProvider } from "../../../services/providers/publicGeoProvider";
import { ScenarioCard } from "../components/ScenarioCard";

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
  status: "locating" | "ready" | "error";
}

export const LocalScenarioPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const generateScenarios = useLocalScenariosStore((state) => state.generateScenarios);
  const saveScenario = useLocalScenariosStore((state) => state.saveScenario);
  const scenarioIds = useLocalScenariosStore((state) => state.scenarioIds);
  const scenariosById = useLocalScenariosStore((state) => state.scenariosById);
  const meta = useLocalScenariosStore((state) => state.flowMeta);
  const progressStep = useLocalScenariosStore((state) => state.progressStep);
  const expectedScenarioCount = useLocalScenariosStore((state) => state.expectedScenarioCount);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationState>({ label: t("local.locating"), status: "locating" });
  const [vibe, setVibe] = useState("coffee + gallery + walk");
  const [availableHours, setAvailableHours] = useState(2);
  const [availableMinuteRemainder, setAvailableMinuteRemainder] = useState(30);
  const [validationError, setValidationError] = useState<string | null>(null);

  const requestLocation = (): void => {
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
  };

  useEffect(() => {
    requestLocation();
  }, []);

  const deferredScenarioIds = useDeferredValue(scenarioIds);
  const scenarios = deferredScenarioIds.map((scenarioId) => scenariosById[scenarioId]).filter((scenario): scenario is NonNullable<typeof scenario> => Boolean(scenario));
  const availableMinutes = availableHours * 60 + availableMinuteRemainder;
  const isGenerating = meta.status === "loading";
  const isRequestValid =
    currentLocation.status === "ready" &&
    currentLocation.latitude !== undefined &&
    currentLocation.longitude !== undefined &&
    vibe.trim().length > 0 &&
    availableMinutes >= 30;

  const validateRequest = (): string | null => {
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
    });
  };

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("local.title")} subtitle={t("local.subtitle")} />
      <GlassPanel elevated sx={{ p: { xs: 2.5, md: 3 } }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label={t("local.location")}
              value={currentLocation.label}
              InputProps={{ readOnly: true }}
              error={currentLocation.status === "error"}
              helperText={currentLocation.status === "error" ? t("local.noPermission") : " "}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField select fullWidth label={t("local.vibe")} value={vibe} onChange={(event) => setVibe(event.target.value)}>
              {vibeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={1}>
            <TextField select fullWidth label={t("local.hours")} value={availableHours} onChange={(event) => setAvailableHours(Number(event.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6, 8].map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={1}>
            <TextField select fullWidth label={t("local.minutes")} value={availableMinuteRemainder} onChange={(event) => setAvailableMinuteRemainder(Number(event.target.value))}>
              {[0, 15, 30, 45].map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="outlined" startIcon={<MyLocationOutlinedIcon />} onClick={requestLocation}>
                {t("local.permission")}
              </Button>
              <Button
                variant="contained"
                disabled={!isRequestValid || isGenerating}
                onClick={() => void submit()}
              >
                {isGenerating ? t("local.generating") : t("local.generate")}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </GlassPanel>
      {validationError ? <Alert severity="warning">{validationError}</Alert> : null}
      {meta.status === "error" && meta.error ? (
        <Alert severity="error">
          {t("local.errors.generationFailed")}
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
      {isGenerating && scenarios.length === 0 ? <LoadingState /> : null}
      <Box sx={{ display: "grid", gap: 2 }}>
        {scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            saveLabel={t("local.save")}
            doneLabel={t("completion.done")}
            skippedLabel={t("completion.skipped")}
            onSave={user ? () => void saveScenario(user.id, scenario.id) : undefined}
          />
        ))}
      </Box>
    </Box>
  );
};
