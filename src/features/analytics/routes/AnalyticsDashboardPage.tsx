import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { AnalyticsChartSections } from "../components/AnalyticsChartSections";
import {
  ANALYTICS_COUNTRY_ALL,
  buildFilteredAnalyticsBundle,
  uniqueCountryFilterOptions,
  type AnalyticsTimeRange,
} from "../analyticsDashboardFilter";
import { analyticsRepository } from "../analyticsRepository";
import type { TravelAnalyticsBundle } from "../analytics.types";
import { TravelerJourneyView, useTravelerJourneyData } from "../../traveler-journey";

const pct = (value: number): string => `${Math.min(100, Math.max(0, Math.round(value * 1000) / 10))}%`;

const StatTile = ({ label, value, sub }: { label: string; value: string | number; sub?: string }): JSX.Element => (
  <GlassPanel sx={{ p: 2, display: "grid", gap: 0.75, minHeight: 88 }}>
    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
      {label}
    </Typography>
    <Typography variant="h5" sx={{ fontWeight: 800 }}>
      {value}
    </Typography>
    {sub ? (
      <Typography variant="caption" color="text.secondary">
        {sub}
      </Typography>
    ) : null}
  </GlassPanel>
);

export const AnalyticsDashboardPage = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const preferences = useUserPreferencesStore((s) => s.preferences);
  const preferencesMeta = useUserPreferencesStore((s) => s.meta);
  const ensurePreferences = useUserPreferencesStore((s) => s.ensurePreferences);
  const ensureTrips = useTripsStore((s) => s.ensureTrips);
  const tripIds = useTripsStore((s) => s.tripIds);
  const tripsById = useTripsStore((s) => s.tripsById);
  const [bundle, setBundle] = useState<TravelAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>("all");
  const [countryFilter, setCountryFilter] = useState<string>(ANALYTICS_COUNTRY_ALL);

  const allowPersonalAnalytics = preferences?.allowPersonalAnalytics === true;
  const prefsLoading = Boolean(user) && preferences === null && preferencesMeta.status === "loading";

  useEffect(() => {
    if (user?.id) {
      void ensurePreferences(user.id);
    }
  }, [ensurePreferences, user?.id]);

  useEffect(() => {
    if (user?.id) {
      void ensureTrips(user.id);
    }
  }, [ensureTrips, user?.id]);

  const tripsForJourney = useMemo(
    () => tripIds.map((id) => tripsById[id]).filter((trip): trip is NonNullable<typeof trip> => Boolean(trip)),
    [tripIds, tripsById],
  );
  const { journey, countriesByTripId } = useTravelerJourneyData(user?.id, tripsForJourney);

  const load = useCallback(
    async (bypass: boolean) => {
      if (!user?.id || !allowPersonalAnalytics) {
        setBundle(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await analyticsRepository.loadDashboard(user.id, {
          bypassCache: bypass,
          allowPersonalAnalytics: true,
        });
        setBundle(next);
      } catch {
        setError(t("analytics.loadError"));
        setBundle(null);
      } finally {
        setLoading(false);
      }
    },
    [allowPersonalAnalytics, t, user?.id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const displayBundle = useMemo(() => {
    if (!bundle || bundle.personalAnalyticsOptedOut) {
      return null;
    }
    return buildFilteredAnalyticsBundle(bundle, timeRange, countryFilter);
  }, [bundle, countryFilter, timeRange]);

  const filterActive = timeRange !== "all" || countryFilter !== ANALYTICS_COUNTRY_ALL;

  const countryMenu = useMemo(() => (bundle ? uniqueCountryFilterOptions(bundle) : []), [bundle]);

  const filteredHasNoTrips =
    bundle != null &&
    displayBundle != null &&
    filterActive &&
    displayBundle.charts.plannedVsCompleted.length === 0 &&
    !bundle.isEmpty;

  useEffect(() => {
    if (countryMenu.length === 0 && countryFilter !== ANALYTICS_COUNTRY_ALL) {
      setCountryFilter(ANALYTICS_COUNTRY_ALL);
    }
  }, [countryFilter, countryMenu.length]);

  if (!user) {
    return <EmptyState title={t("analytics.signInTitle")} description={t("analytics.signInDescription")} />;
  }

  if (prefsLoading) {
    return (
      <Box sx={{ py: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!allowPersonalAnalytics) {
    return (
      <Box sx={{ display: "grid", gap: 2.5, pb: 3 }}>
        <SectionHeader title={t("analytics.pageTitle")} subtitle={t("analytics.pageSubtitlePrivate")} />
        <EmptyState
          title={t("analytics.privacyDisabledTitle")}
          description={t("analytics.privacyDisabledDescription")}
          icon={<BarChartOutlinedIcon sx={{ fontSize: 52, color: "text.disabled" }} />}
          actionLabel={t("analytics.openSettingsForAnalytics")}
          onAction={() => {
            void navigate({ to: "/settings" });
          }}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2.5, pb: 3 }}>
      <SectionHeader
        title={t("analytics.pageTitle")}
        subtitle={t("analytics.pageSubtitlePrivate")}
        action={
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            disabled={loading}
            onClick={() => {
              analyticsRepository.invalidateForUser(user.id);
              void load(true);
            }}
          >
            {t("analytics.refresh")}
          </Button>
        }
      />

      <TravelerJourneyView journey={journey} countriesByTripId={countriesByTripId} variant="full" />

      {error ? (
        <Alert severity="error" variant="outlined">
          {error}
        </Alert>
      ) : null}

      {loading && !bundle ? (
        <Box sx={{ py: 4 }}>
          <LinearProgress />
        </Box>
      ) : null}

      {bundle?.personalAnalyticsOptedOut ? (
        <EmptyState
          title={t("analytics.privacyDisabledTitle")}
          description={t("analytics.privacyDisabledDescription")}
          icon={<BarChartOutlinedIcon sx={{ fontSize: 52, color: "text.disabled" }} />}
          actionLabel={t("analytics.openSettingsForAnalytics")}
          onAction={() => {
            void navigate({ to: "/settings" });
          }}
        />
      ) : null}

      {bundle && !bundle.personalAnalyticsOptedOut && bundle.partial ? (
        <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
          {t("analytics.partialHint")}
        </Alert>
      ) : null}

      {bundle && !bundle.personalAnalyticsOptedOut && bundle.isEmpty ? (
        <EmptyState
          title={t("analytics.emptyStates.noTripsTitle")}
          description={t("analytics.emptyStates.noTripsDescription")}
          icon={<BarChartOutlinedIcon sx={{ fontSize: 52, color: "text.disabled" }} />}
        />
      ) : null}

      {bundle && !bundle.personalAnalyticsOptedOut && !bundle.isEmpty && displayBundle ? (
        <>
          <GlassPanel sx={{ p: 2, display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
            <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                {t("analytics.filters.timeLabel")}
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={timeRange}
                onChange={(_, v: AnalyticsTimeRange | null) => {
                  if (v) {
                    setTimeRange(v);
                  }
                }}
                aria-label={t("analytics.filters.timeLabel")}
                sx={{ flexWrap: "wrap" }}
              >
                <ToggleButton value="all">{t("analytics.filters.allTime")}</ToggleButton>
                <ToggleButton value="12m">{t("analytics.filters.last12m")}</ToggleButton>
                <ToggleButton value="6m">{t("analytics.filters.last6m")}</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {countryMenu.length > 0 ? (
              <FormControl size="small" sx={{ minWidth: 200, flex: "0 1 220px" }}>
                <InputLabel id="wm-analytics-country">{t("analytics.filters.countryLabel")}</InputLabel>
                <Select
                  labelId="wm-analytics-country"
                  label={t("analytics.filters.countryLabel")}
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(String(e.target.value))}
                >
                  <MenuItem value={ANALYTICS_COUNTRY_ALL}>{t("analytics.filters.allCountries")}</MenuItem>
                  {countryMenu.map((c) => (
                    <MenuItem key={c.value} value={c.value}>
                      {c.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
          </GlassPanel>

          {filteredHasNoTrips ? (
            <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
              {t("analytics.emptyStates.filteredNoTrips")}
            </Alert>
          ) : null}

          <Grid container spacing={2}>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile label={t("analytics.summaryCard.tripsCompleted")} value={displayBundle.summary.completedTrips} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile label={t("analytics.summaryCard.completionRate")} value={pct(displayBundle.summary.averageCompletionRate)} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile label={t("analytics.summaryCard.skipRate")} value={pct(displayBundle.summary.averageSkipRate)} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile label={t("analytics.summaryCard.avgDelay")} value={`${displayBundle.summary.averageDelayMinutes} min`} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile label={t("analytics.summaryCard.citiesVisited")} value={displayBundle.summary.citiesVisited} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label={t("analytics.summaryCard.bucketCompleted")}
                value={bundle.summary.bucketItemsCompleted}
                sub={filterActive ? t("analytics.summaryCard.bucketAllTimeHint") : undefined}
              />
            </Grid>
          </Grid>

          {!bundle.charts.thresholds.hasCompletionLine && bundle.tripSummaries.length > 0 ? (
            <GlassPanel sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {t("analytics.emptyStates.notEnoughTripsTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("analytics.emptyStates.notEnoughTripsDescription")}
              </Typography>
            </GlassPanel>
          ) : null}

          {bundle.charts.bucket.total === 0 ? (
            <GlassPanel sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {t("analytics.emptyStates.noBucketTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("analytics.emptyStates.noBucketDescription")}
              </Typography>
              <Button component={Link} to="/bucket-list" variant="text" size="small" sx={{ mt: 1, alignSelf: "start" }}>
                {t("analytics.emptyStates.openBucketList")}
              </Button>
            </GlassPanel>
          ) : null}

          {bundle.summary.achievementsUnlocked === 0 && !bundle.charts.thresholds.hasAchievementBars ? (
            <GlassPanel sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {t("analytics.emptyStates.noAchievementsTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("analytics.emptyStates.noAchievementsDescription")}
              </Typography>
              <Button component={Link} to="/achievements" variant="text" size="small" sx={{ mt: 1, alignSelf: "start" }}>
                {t("analytics.emptyStates.openAchievements")}
              </Button>
            </GlassPanel>
          ) : null}

          {bundle.insights.length > 0 ? (
            <GlassPanel sx={{ p: 2, display: "grid", gap: 1.25 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {t("analytics.insights.heading")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("analytics.insights.subheading")}
              </Typography>
              {bundle.insights.map((insight) => (
                <Alert
                  key={insight.id}
                  severity={insight.severity === "positive" ? "success" : insight.severity}
                  variant="outlined"
                  sx={{ borderRadius: 2, alignItems: "flex-start" }}
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      {insight.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {insight.description}
                    </Typography>
                    {insight.relatedMetric ? (
                      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.75 }}>
                        {t("analytics.insights.metric", { metric: insight.relatedMetric })}
                      </Typography>
                    ) : null}
                  </Box>
                </Alert>
              ))}
            </GlassPanel>
          ) : null}

          {bundle.behaviorProfile ? (
            <GlassPanel sx={{ p: 2, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Typography variant="subtitle2" sx={{ width: "100%", mb: 0.5 }}>
                {t("analytics.behavior.title")}
              </Typography>
              <Chip label={t(`analytics.behavior.pace.${bundle.behaviorProfile.preferredPace}`)} color="primary" variant="outlined" />
              <Chip label={t(`analytics.behavior.bias.${bundle.behaviorProfile.planningBias}`)} variant="outlined" />
              <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: "auto" } }}>
                {t("analytics.behavior.updated", { when: new Date(bundle.behaviorProfile.lastUpdatedAt).toLocaleString() })}
              </Typography>
            </GlassPanel>
          ) : null}

          <AnalyticsChartSections
            bundle={displayBundle}
            filterNote={filterActive ? t("analytics.filterAggregateNote") : null}
          />

          <GlassPanel sx={{ p: 2, display: "grid", gap: 1 }}>
            <Typography variant="subtitle2">{t("analytics.footerNote")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("analytics.footerBody")}
            </Typography>
            <Button component={Link} to="/trips" variant="text" size="small" sx={{ alignSelf: "start" }}>
              {t("analytics.openTrips")}
            </Button>
          </GlassPanel>
        </>
      ) : null}
    </Box>
  );
};
