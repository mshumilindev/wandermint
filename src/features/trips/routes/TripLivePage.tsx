import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DirectionsWalkRoundedIcon from "@mui/icons-material/DirectionsWalkRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import PauseCircleFilledRoundedIcon from "@mui/icons-material/PauseCircleFilledRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Alert, Box, Button, Chip, Collapse, Divider, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Typography } from "@mui/material";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripDetailsStore } from "../../../app/store/useTripDetailsStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { calculateTimelineProgress } from "../../timeline-progress/calculateTimelineProgress";
import { TimelineProgressCard } from "../../timeline-progress/TimelineProgressCard";
import { decide } from "../../trip-execution/decisionEngine";
import type { TripExecutionEnergyLevel, TripPlanItem } from "../../trip-execution/decisionEngine.types";
import { isoToMs, sortByPlannedStart } from "../../trip-execution/decisionEngine.utils";
import { replanTrip } from "../../trip-execution/replanning/replanTrip";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { LoadingState } from "../../../shared/ui/LoadingState";
import { OfflineState } from "../../../shared/ui/states/OfflineState";
import { DayTimeline } from "../../timeline-visual/DayTimeline";
import { TripCurrentDayPhaseBanner } from "../components/TripCurrentDayPhaseBanner";
import { dayPlanToTripPlanItems } from "../execution/buildLiveExecutionModel";
import {
  buildExecutionStateFromDay,
  completionIdsFromDay,
  mergeReplanIntoDayPlan,
  pickLiveDayId,
} from "../execution/buildLiveExecutionModel";
import { subscribeTripRealtime } from "../realtime/subscribeToTrip";
import type { TripRealtimeBundle } from "../realtime/tripRealtime.types";
import { classifyDayVsToday } from "../pacing/tripCurrentDay";
import { resolvePlanTimezone } from "../pacing/planTimeUtils";
import { useNetworkStatus } from "../../offline/networkStatus";
import {
  getReservationRequirementForBlock,
  shouldSurfaceReservationBeforeVisit,
} from "../../reservations/reservationHints";

const coPilotBackdrop =
  "radial-gradient(1200px 600px at 12% -8%, rgba(0, 180, 216, 0.18), transparent 55%), radial-gradient(900px 500px at 88% 0%, rgba(255, 183, 77, 0.12), transparent 50%), linear-gradient(180deg, rgba(4, 12, 20, 0.96) 0%, rgba(3, 8, 14, 0.98) 40%, rgba(2, 6, 12, 1) 100%)";

const railGradient = "linear-gradient(180deg, rgba(0, 212, 255, 0.55), rgba(255, 183, 77, 0.35))";

const formatClock = (d: Date, timeZone: string): string =>
  d.toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit" });

const formatWallTime = (iso: string, timeZone: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit" });

export const TripLivePage = (): JSX.Element => {
  const { t } = useTranslation();
  const online = useNetworkStatus();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { tripId?: string };
  const tripId = params.tripId ?? "";
  const user = useAuthStore((state) => state.user);
  const trip = useTripsStore((state) => state.tripsById[tripId]);
  const ensureTripDetails = useTripDetailsStore((state) => state.ensureTripDetails);
  const applyRemoteTripSnapshot = useTripDetailsStore((state) => state.applyRemoteTripSnapshot);
  const dayIds = useTripDetailsStore((state) => state.tripDayIdsByTripId[tripId] ?? []);
  const dayPlansById = useTripDetailsStore((state) => state.dayPlansById);
  const detailsMeta = useTripDetailsStore((state) => state.detailsMetaByTripId[tripId]);
  const saveDayPlan = useTripDetailsStore((state) => state.saveDayPlan);
  const updateActivityCompletion = useTripDetailsStore((state) => state.updateActivityCompletion);
  const pushToast = useUiStore((state) => state.pushToast);

  const [clock, setClock] = useState(() => new Date());
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [completedFoldOpen, setCompletedFoldOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tripRealtime, setTripRealtime] = useState<Pick<TripRealtimeBundle, "connection" | "lastUpdatedIso" | "hydrated"> | null>(null);

  useEffect(() => {
    if (user && tripId) {
      void ensureTripDetails(user.id, tripId);
    }
  }, [ensureTripDetails, tripId, user]);

  useEffect(() => {
    if (!user?.id || !tripId) {
      setTripRealtime(null);
      return;
    }
    const unsub = subscribeTripRealtime(tripId, {
      onNext: (bundle) => {
        if (bundle.hydrated) {
          applyRemoteTripSnapshot(tripId, {
            ...(bundle.trip ? { trip: bundle.trip } : {}),
            dayPlans: bundle.dayPlans,
          });
        }
        setTripRealtime({
          connection: bundle.connection,
          lastUpdatedIso: bundle.lastUpdatedIso,
          hydrated: bundle.hydrated,
        });
      },
    });
    return () => unsub();
  }, [applyRemoteTripSnapshot, tripId, user?.id]);

  const days = useMemo(
    () => dayIds.map((id) => dayPlansById[id]).filter((d): d is NonNullable<typeof d> => Boolean(d)),
    [dayIds, dayPlansById],
  );

  const activeDay = useMemo(() => {
    if (selectedDayId) {
      return dayPlansById[selectedDayId] ?? null;
    }
    return pickLiveDayId(trip ?? null, days, clock);
  }, [selectedDayId, dayPlansById, trip, days, clock]);

  useEffect(() => {
    if (!selectedDayId && activeDay) {
      setSelectedDayId(activeDay.id);
    }
  }, [activeDay, selectedDayId]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timeZone = useMemo(
    () => (activeDay ? resolvePlanTimezone(trip ?? null, activeDay.segmentId) : "UTC"),
    [activeDay, trip],
  );

  const { completed: completedIds, skipped: skippedIds } = useMemo(() => {
    if (!activeDay) {
      return { completed: [] as string[], skipped: [] as string[] };
    }
    return completionIdsFromDay(activeDay);
  }, [activeDay]);

  const executionState = useMemo(() => {
    if (!activeDay) {
      return null;
    }
    return buildExecutionStateFromDay(activeDay, trip ?? null, {
      nowIso: clock.toISOString(),
      completedIds,
      skippedIds,
    });
  }, [activeDay, trip, clock, completedIds, skippedIds]);

  const timelineProgress = useMemo(
    () => (executionState ? calculateTimelineProgress(executionState) : null),
    [executionState],
  );

  const decision = useMemo(() => (executionState ? decide(executionState) : null), [executionState]);

  const sortedItems = useMemo(
    () => (executionState ? sortByPlannedStart(executionState.items) : []),
    [executionState],
  );

  const completedSet = useMemo(() => new Set(completedIds), [completedIds]);
  const skippedSet = useMemo(() => new Set(skippedIds), [skippedIds]);

  const completedItems = useMemo(
    () => sortedItems.filter((i) => completedSet.has(i.id) || i.status === "completed"),
    [sortedItems, completedSet],
  );
  const skippedItems = useMemo(
    () => sortedItems.filter((i) => skippedSet.has(i.id) || i.status === "skipped"),
    [sortedItems, skippedSet],
  );
  const upcomingItems = useMemo(
    () => sortedItems.filter((i) => !completedSet.has(i.id) && !skippedSet.has(i.id)),
    [sortedItems, completedSet, skippedSet],
  );

  const nextCardItem: TripPlanItem | undefined = decision?.nextItem ?? upcomingItems[0];

  const nextBlock = useMemo(
    () => (activeDay && nextCardItem ? activeDay.blocks.find((b) => b.id === nextCardItem.id) : undefined),
    [activeDay, nextCardItem],
  );

  const nextReservation = useMemo(
    () => (nextBlock ? getReservationRequirementForBlock(nextBlock) : null),
    [nextBlock],
  );

  const nextReservationMessageKey = useMemo(() => {
    if (!nextReservation || !shouldSurfaceReservationBeforeVisit(nextReservation)) {
      return null;
    }
    return `trips.live.reservations.${nextReservation.requirement}` as const;
  }, [nextReservation]);

  const recommendedLabel = useMemo(() => {
    if (!decision) {
      return "";
    }
    const key = `trips.live.actions.${decision.recommendedAction}`;
    const translated = t(key);
    return translated === key ? decision.recommendedAction : translated;
  }, [decision, t]);

  const statusMeta = useMemo(() => {
    if (!decision) {
      return { label: "", color: "default" as const, warn: false };
    }
    const key = `trips.live.status.${decision.status}`;
    const label = t(key);
    if (decision.status === "needs_replan") {
      return { label: label === key ? decision.status : label, color: "error" as const, warn: true };
    }
    if (decision.status === "overloaded" || decision.status === "delayed") {
      return { label: label === key ? decision.status : label, color: "warning" as const, warn: true };
    }
    return { label: label === key ? decision.status : label, color: "success" as const, warn: false };
  }, [decision, t]);

  const realtimeConnectionChip = useMemo(() => {
    if (!tripRealtime?.hydrated) {
      return { label: t("trips.realtime.connectionConnecting"), color: "default" as const };
    }
    switch (tripRealtime.connection) {
      case "live":
        return { label: t("trips.realtime.connectionLive"), color: "success" as const };
      case "offline_cached":
        return { label: t("trips.realtime.connectionOfflineCached"), color: "warning" as const };
      case "syncing":
        return { label: t("trips.realtime.connectionSyncing"), color: "info" as const };
      case "error":
        return { label: t("trips.realtime.connectionError"), color: "error" as const };
      default:
        return { label: t("trips.realtime.connectionConnecting"), color: "default" as const };
    }
  }, [tripRealtime, t]);

  const realtimeLastUpdatedLabel = useMemo(() => {
    const iso = tripRealtime?.lastUpdatedIso;
    if (!iso) {
      return null;
    }
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) {
      return null;
    }
    return t("trips.realtime.lastUpdated", { when: d.toLocaleString() });
  }, [tripRealtime?.lastUpdatedIso, t]);

  const isFocusCalendarToday = useMemo(() => {
    if (!activeDay || !trip) {
      return false;
    }
    return classifyDayVsToday(activeDay, trip, clock) === "today";
  }, [activeDay, trip, clock]);

  const runReplan = useCallback(
    async (
      reason: "user_skipped_item" | "user_is_late" | "user_energy_low",
      opts?: { energyLevel?: TripExecutionEnergyLevel; affectedItemId?: string },
    ): Promise<void> => {
      if (!activeDay || !user) {
        return;
      }
      setBusy(reason);
      try {
        const { completed, skipped } = completionIdsFromDay(activeDay);
        const state = buildExecutionStateFromDay(activeDay, trip ?? null, {
          nowIso: new Date().toISOString(),
          completedIds: completed,
          skippedIds: skipped,
          energyLevel: opts?.energyLevel,
        });
        const result = await replanTrip(
          {
            executionState: state,
            reason,
            ...(opts?.affectedItemId ? { affectedItemId: opts.affectedItemId } : {}),
          },
          {},
        );
        const merged = mergeReplanIntoDayPlan(activeDay, result, trip ?? null);
        await saveDayPlan(tripId, merged);
        pushToast({
          tone: "success",
          message: online ? result.messageToUser : t("trips.live.replanQueuedOffline"),
        });
      } catch {
        pushToast({ tone: "error", message: t("trips.live.replanFailed") });
      } finally {
        setBusy(null);
      }
    },
    [activeDay, user, saveDayPlan, tripId, trip, pushToast, t, online],
  );

  const handleMarkDone = async (): Promise<void> => {
    if (!activeDay || !nextCardItem || !user) {
      return;
    }
    setBusy("done");
    try {
      await updateActivityCompletion(tripId, activeDay.id, nextCardItem.id, "done");
      pushToast({
        tone: "success",
        message: online ? t("trips.live.markedDone") : t("trips.live.markedDoneOffline"),
      });
    } catch {
      pushToast({ tone: "error", message: t("trips.live.actionFailed") });
    } finally {
      setBusy(null);
    }
  };

  const handleSkip = async (): Promise<void> => {
    if (!activeDay || !nextCardItem || !user) {
      return;
    }
    setBusy("skip");
    try {
      await updateActivityCompletion(tripId, activeDay.id, nextCardItem.id, "skipped");
      const fresh = useTripDetailsStore.getState().dayPlansById[activeDay.id];
      if (!fresh) {
        return;
      }
      const { completed, skipped } = completionIdsFromDay(fresh);
      const nextState = buildExecutionStateFromDay(fresh, trip ?? null, {
        nowIso: new Date().toISOString(),
        completedIds: completed,
        skippedIds: skipped,
      });
      const result = await replanTrip({ executionState: nextState, reason: "user_skipped_item" }, {});
      const merged = mergeReplanIntoDayPlan(fresh, result, trip ?? null);
      await saveDayPlan(tripId, merged);
      pushToast({
        tone: "success",
        message: online ? result.messageToUser : t("trips.live.replanQueuedOffline"),
      });
    } catch {
      pushToast({ tone: "error", message: t("trips.live.actionFailed") });
    } finally {
      setBusy(null);
    }
  };

  const handleBreak = (): void => {
    void runReplan("user_energy_low", { energyLevel: "low" });
  };

  const handleManualReplan = (): void => {
    void runReplan("user_is_late");
  };

  if (!trip) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>{t("trips.empty")}</Typography>
      </Box>
    );
  }

  if (detailsMeta?.status === "loading" && days.length === 0 && online) {
    return (
      <Box sx={{ p: 4, background: coPilotBackdrop, minHeight: "100vh" }}>
        <LinearProgress sx={{ mb: 1 }} />
        <LoadingState layout="embedded" showSpinner={false} message={t("trips.live.loading")} sx={{ py: 2 }} />
      </Box>
    );
  }

  if (!activeDay || !executionState || !decision) {
    return (
      <Box sx={{ p: 3, background: coPilotBackdrop, minHeight: "100vh" }}>
        <Button
          startIcon={<ArrowBackRoundedIcon />}
          variant="text"
          sx={{ mb: 2 }}
          onClick={() => void navigate({ to: "/trips/$tripId", params: { tripId } })}
        >
          {t("trips.live.back")}
        </Button>
        {!online ? (
          <OfflineState variant="banner" message={t("trips.live.offlineBanner")} sx={{ mb: 2 }} />
        ) : null}
        <Typography variant="h5" sx={{ mb: 1 }}>
          {trip.title}
        </Typography>
        <Typography color="text.secondary">
          {detailsMeta?.error === "offline_no_cache" ? t("trips.live.offlineNoCache") : t("trips.live.noDayData")}
        </Typography>
      </Box>
    );
  }

  const timelineDot = (tone: "done" | "skip" | "up" | "next"): Record<string, string> => {
    if (tone === "done") {
      return { bg: "rgba(46, 204, 113, 0.35)", border: "1px solid rgba(46, 204, 113, 0.85)" };
    }
    if (tone === "skip") {
      return { bg: "rgba(255, 138, 76, 0.22)", border: "1px solid rgba(255, 138, 76, 0.75)" };
    }
    if (tone === "next") {
      return { bg: "rgba(0, 212, 255, 0.35)", border: "1px solid rgba(0, 212, 255, 0.95)", boxShadow: "0 0 0 6px rgba(0, 212, 255, 0.12)" };
    }
    return { bg: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.22)" };
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: coPilotBackdrop,
        color: "text.primary",
        pb: 6,
        pt: { xs: 1.5, md: 2 },
        px: { xs: 1.5, sm: 2.5, md: 4 },
      }}
    >
      {!online ? <OfflineState variant="banner" message={t("trips.live.offlineBanner")} sx={{ mb: 2 }} /> : null}
      {trip && days.length > 0 ? (
        <Box sx={{ mb: 2 }}>
          <TripCurrentDayPhaseBanner trip={trip} dayPlans={days} />
        </Box>
      ) : null}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5, flexWrap: "wrap", gap: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
          <Button
            startIcon={<ArrowBackRoundedIcon />}
            variant="text"
            sx={{ color: "primary.light" }}
            onClick={() => void navigate({ to: "/trips/$tripId", params: { tripId } })}
          >
            {t("trips.live.back")}
          </Button>
          <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.12)", display: { xs: "none", sm: "block" } }} />
          <Typography variant="overline" sx={{ letterSpacing: 3, color: "primary.light", fontWeight: 800 }}>
            {t("trips.live.badge")}
          </Typography>
        </Stack>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="live-day-label">{t("trips.live.day")}</InputLabel>
          <Select
            labelId="live-day-label"
            label={t("trips.live.day")}
            value={activeDay.id}
            onChange={(e) => setSelectedDayId(String(e.target.value))}
          >
            {days.map((d) => {
              const isCalToday = trip ? classifyDayVsToday(d, trip, clock) === "today" : false;
              return (
                <MenuItem
                  key={d.id}
                  value={d.id}
                  sx={
                    isCalToday
                      ? (theme) => ({
                          borderLeft: `3px solid ${theme.palette.primary.main}`,
                          bgcolor: theme.palette.mode === "dark" ? "rgba(0, 212, 255, 0.06)" : "rgba(25, 118, 210, 0.06)",
                        })
                      : undefined
                  }
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography component="span" variant="body2">
                      {d.date} · {d.cityLabel}
                    </Typography>
                    {isCalToday ? (
                      <Chip label={t("trips.currentDay.todayBadge")} size="small" color="primary" variant="outlined" sx={{ height: 22 }} />
                    ) : null}
                  </Stack>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Stack>

      <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: 0.4, mb: 0.5 }}>
        {trip.title}
      </Typography>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="body2" color="text.secondary">
            {activeDay.cityLabel} · {activeDay.date}
          </Typography>
          {isFocusCalendarToday ? (
            <Chip label={t("trips.currentDay.todayBadge")} size="small" color="primary" variant="outlined" sx={{ height: 22 }} />
          ) : null}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          {realtimeLastUpdatedLabel ? (
            <Typography variant="caption" color="text.secondary">
              {realtimeLastUpdatedLabel}
            </Typography>
          ) : null}
          <Chip size="small" label={realtimeConnectionChip.label} color={realtimeConnectionChip.color} variant="outlined" />
        </Stack>
      </Stack>

      {timelineProgress ? (
        <Box sx={{ mb: 2, maxWidth: 920, mx: "auto", width: "100%" }}>
          <TimelineProgressCard progress={timelineProgress} timeZone={timeZone} />
        </Box>
      ) : null}

      {activeDay.blocks.length > 0 ? (
        <Box sx={{ mb: 2, maxWidth: 920, mx: "auto", width: "100%" }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {t("timelineVisual.scheduleHeading")}
          </Typography>
          <DayTimeline
            date={activeDay.date}
            timezone={timeZone}
            startHour={6}
            endHour={24}
            items={dayPlanToTripPlanItems(activeDay, trip, activeDay.movementLegs)}
          />
        </Box>
      ) : null}

      <Stack spacing={2.75} sx={{ maxWidth: 920, mx: "auto" }}>
        <GlassPanel
          sx={{
            p: 2.25,
            borderRadius: 3,
            border: "1px solid rgba(0, 212, 255, 0.22)",
            background: "linear-gradient(135deg, rgba(4, 18, 28, 0.72), rgba(6, 14, 22, 0.55))",
            boxShadow: "0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "center" }} justifyContent="space-between">
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1.2, textTransform: "uppercase" }}>
                {t("trips.live.localTime")}
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                {formatClock(clock, timeZone)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {timeZone}
              </Typography>
            </Box>
            <Stack spacing={1} alignItems={{ xs: "flex-start", sm: "flex-end" }} sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={statusMeta.label} color={statusMeta.color} variant={statusMeta.warn ? "filled" : "outlined"} />
                {statusMeta.warn ? <WarningAmberRoundedIcon color="warning" fontSize="small" /> : null}
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.light", textAlign: { xs: "left", sm: "right" } }}>
                {t("trips.live.nextMove")}: {recommendedLabel}
              </Typography>
            </Stack>
          </Stack>
          {busy ? <LinearProgress sx={{ mt: 2, borderRadius: 99, height: 3 }} /> : null}
        </GlassPanel>

        {nextCardItem ? (
          <GlassPanel
            sx={{
              p: 0,
              overflow: "hidden",
              borderRadius: 3,
              border: "1px solid rgba(255, 183, 77, 0.22)",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "minmax(148px, 34%) 1fr" },
              boxShadow: "0 28px 70px rgba(0,0,0,0.38)",
            }}
          >
            <Box sx={{ position: "relative", minHeight: { xs: 160, sm: "100%" } }}>
              <EntityPreviewImage
                entityId={`live-focus:${nextCardItem.id}`}
                variant="activityThumb"
                title={nextBlock?.place?.name ?? nextCardItem.title}
                locationHint={[nextBlock?.place?.city, nextBlock?.place?.country].filter(Boolean).join(", ") || activeDay.cityLabel}
                categoryHint={nextBlock?.category ?? nextCardItem.type}
                latitude={nextBlock?.place?.latitude}
                longitude={nextBlock?.place?.longitude}
                sx={{ height: "100%", minHeight: { xs: 168, sm: 220 }, borderRadius: 0, border: "none" }}
              />
              <Chip
                label={t("trips.live.focusLabel")}
                size="small"
                sx={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  fontWeight: 800,
                  backdropFilter: "blur(8px)",
                  bgcolor: "rgba(4,12,18,0.55)",
                }}
              />
            </Box>
            <Stack spacing={1.5} sx={{ p: 2.25 }}>
              <Typography variant="overline" color="primary.light" sx={{ letterSpacing: 1 }}>
                {t("trips.live.nextStop")}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                {nextCardItem.title}
              </Typography>
              {nextReservationMessageKey ? (
                <Alert
                  severity={
                    nextReservation?.requirement === "required" || nextReservation?.requirement === "time_slot_required"
                      ? "warning"
                      : "info"
                  }
                  variant="outlined"
                  sx={{ borderRadius: 2, bgcolor: "rgba(0, 24, 36, 0.35)" }}
                >
                  {t(nextReservationMessageKey)}
                </Alert>
              ) : null}
              <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
                <Chip icon={<AccessTimeRoundedIcon />} label={`${formatWallTime(nextCardItem.plannedStartTime, timeZone)} – ${formatWallTime(nextCardItem.plannedEndTime, timeZone)}`} size="small" />
                {nextCardItem.travelTimeFromPreviousMinutes > 0 ? (
                  <Chip
                    icon={<DirectionsWalkRoundedIcon />}
                    label={
                      nextCardItem.travelEstimateConfidence === "low"
                        ? t("trips.live.travelLegApprox", { minutes: nextCardItem.travelTimeFromPreviousMinutes })
                        : t("trips.live.travelLeg", { minutes: nextCardItem.travelTimeFromPreviousMinutes })
                    }
                    size="small"
                    variant="outlined"
                    color={nextCardItem.travelEstimateConfidence === "low" ? "warning" : "default"}
                  />
                ) : null}
                <Chip label={nextCardItem.priority} size="small" variant="outlined" />
              </Stack>
              <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button variant="contained" color="success" disabled={Boolean(busy)} onClick={() => void handleMarkDone()}>
                  {t("trips.live.markDone")}
                </Button>
                <Button variant="outlined" color="warning" disabled={Boolean(busy)} onClick={() => void handleSkip()}>
                  {t("trips.live.skip")}
                </Button>
                <Button startIcon={<RefreshRoundedIcon />} variant="outlined" disabled={Boolean(busy)} onClick={handleManualReplan}>
                  {t("trips.live.replan")}
                </Button>
                <Button startIcon={<PauseCircleFilledRoundedIcon />} variant="text" disabled={Boolean(busy)} onClick={handleBreak}>
                  {t("trips.live.break")}
                </Button>
              </Stack>
            </Stack>
          </GlassPanel>
        ) : (
          <GlassPanel sx={{ p: 3, borderRadius: 3 }}>
            <Typography>{t("trips.live.allClear")}</Typography>
          </GlassPanel>
        )}

        <GlassPanel sx={{ p: 2.5, borderRadius: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <RouteRoundedIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {t("trips.live.timelineTitle")}
            </Typography>
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: "22px 1fr", columnGap: 1.5 }}>
            <Box sx={{ position: "relative", width: 22, justifySelf: "center" }}>
              <Box sx={{ position: "absolute", top: 10, bottom: 10, left: "50%", width: 3, transform: "translateX(-50%)", borderRadius: 99, background: railGradient, opacity: 0.85 }} />
            </Box>
            <Stack spacing={1.25}>
              {completedItems.length > 0 ? (
                <Box>
                  <Button
                    size="small"
                    onClick={() => setCompletedFoldOpen((o) => !o)}
                    startIcon={<CheckCircleRoundedIcon />}
                    sx={{ justifyContent: "flex-start", textTransform: "none", color: "success.light" }}
                  >
                    {t("trips.live.completedFold", { count: completedItems.length })}
                  </Button>
                  <Collapse in={completedFoldOpen}>
                    <Stack spacing={0.75} sx={{ pl: 0.5, pt: 1 }}>
                      {completedItems.map((item) => (
                        <Typography key={item.id} variant="caption" color="text.secondary">
                          ✓ {item.title} · {formatWallTime(item.plannedStartTime, timeZone)}
                        </Typography>
                      ))}
                    </Stack>
                  </Collapse>
                </Box>
              ) : null}

              {skippedItems.map((item) => (
                <Stack key={item.id} direction="row" spacing={1.25} alignItems="flex-start">
                  <Box
                    sx={{
                      mt: 0.35,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      flexShrink: 0,
                      ...timelineDot("skip"),
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0, opacity: 0.72 }}>
                    <Typography variant="body2" sx={{ textDecoration: "line-through", fontWeight: 700 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="warning.light">
                      {t("trips.live.skippedStamp")}
                    </Typography>
                  </Box>
                </Stack>
              ))}

              {upcomingItems.map((item) => {
                const isNext = nextCardItem?.id === item.id;
                return (
                  <Stack key={item.id} direction="row" spacing={1.25} alignItems="flex-start">
                    <Box
                      sx={{
                        mt: 0.35,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        flexShrink: 0,
                        ...timelineDot(isNext ? "next" : "up"),
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: isNext ? 800 : 600, color: isNext ? "primary.light" : "text.primary" }}>
                        {item.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatWallTime(item.plannedStartTime, timeZone)} · {item.priority}
                        {item.travelTimeFromPreviousMinutes > 0
                          ? item.travelEstimateConfidence === "low"
                            ? ` · ${t("trips.live.minTravelApprox", { minutes: item.travelTimeFromPreviousMinutes })}`
                            : ` · +${item.travelTimeFromPreviousMinutes} ${t("trips.live.minTravel")}`
                          : ""}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        </GlassPanel>

        <GlassPanel sx={{ p: 2.25, borderRadius: 3, border: "1px dashed rgba(0, 212, 255, 0.28)", bgcolor: "rgba(4, 14, 22, 0.45)" }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <FlagRoundedIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {t("trips.live.engineTitle")}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            {decision.explanation}
          </Typography>
        </GlassPanel>

        <Stack direction="row" justifyContent="center" sx={{ pt: 1 }}>
          <Button
            variant="text"
            size="small"
            onClick={() => void navigate({ to: "/trips/$tripId/day/$dayId", params: { tripId, dayId: activeDay.id } })}
          >
            {t("trips.live.openDayPlan")}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};
