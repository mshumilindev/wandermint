import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import { Alert, Box, Chip, CircularProgress, Fade, Grid, LinearProgress, Stack, Typography } from "@mui/material";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import { productConfig } from "../../shared/config/product";
import { BrandLogo } from "../../shared/ui/BrandLogo";
import { EmptyState } from "../../shared/ui/EmptyState";
import { GlassPanel } from "../../shared/ui/GlassPanel";
import { SectionHeader } from "../../shared/ui/SectionHeader";
import { MetadataPill } from "../../shared/ui/MetadataPill";
import { getCountryFlagEmoji } from "../../shared/ui/CountryFlag";
import { formatUserFriendlyDateRange } from "../../shared/lib/dateDisplay";
import { DayPlanTimeline } from "../trips/components/DayPlanTimeline";
import { TripCurrentDayPhaseBanner } from "../trips/components/TripCurrentDayPhaseBanner";
import { IntercityMovesPanel } from "../trips/components/IntercityMovesPanel";
import { subscribeTripRealtime } from "../trips/realtime/subscribeToTrip";
import type { TripRealtimeBundle } from "../trips/realtime/tripRealtime.types";
import type { TripShare } from "./share.types";
import { shareRepository } from "./shareRepository";
import { redactTripForShare, sanitizeDayPlansForShare } from "./shareViewSanitize";
import { calculateTimelineProgress } from "../timeline-progress/calculateTimelineProgress";
import { TimelineProgressCard } from "../timeline-progress/TimelineProgressCard";
import { buildExecutionStateFromDay, completionIdsFromDay, pickLiveDayId } from "../trips/execution/buildLiveExecutionModel";
import { resolvePlanTimezone } from "../trips/pacing/planTimeUtils";

type ShareRealtimeMeta = Pick<TripRealtimeBundle, "connection" | "lastUpdatedIso" | "hydrated">;

const structureSignature = (days: readonly DayPlan[]): string =>
  [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => `${d.id}:${d.blocks.map((b) => `${b.id}:${b.startTime}:${b.endTime}`).join(";")}`)
    .join("||");

const completionByBlock = (days: readonly DayPlan[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const d of days) {
    for (const b of d.blocks) {
      m.set(b.id, b.completionStatus);
    }
  }
  return m;
};

const diffCompletionChangedIds = (prev: Map<string, string>, next: Map<string, string>): string[] => {
  const ids = new Set<string>();
  for (const [id, st] of next) {
    if (prev.get(id) !== st) {
      ids.add(id);
    }
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) {
      ids.add(id);
    }
  }
  return [...ids];
};

/** Read-only shared itinerary — no personal analytics, account preferences, or aggregate dashboards. */
export const ShareTripPage = (): JSX.Element => {
  const { t } = useTranslation();
  const params = useParams({ strict: false }) as { shareToken?: string };
  const shareToken = params.shareToken ?? "";
  const [shareCtx, setShareCtx] = useState<{ tripId: string; share: TripShare } | null>(null);
  const [shareResolved, setShareResolved] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [dayPlans, setDayPlans] = useState<DayPlan[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realtimeMeta, setRealtimeMeta] = useState<ShareRealtimeMeta | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());
  const [hasSyncedLive, setHasSyncedLive] = useState(false);
  const [remotePlanUpdating, setRemotePlanUpdating] = useState(false);
  const [freshnessVisible, setFreshnessVisible] = useState(false);
  const [completionHighlightIds, setCompletionHighlightIds] = useState<ReadonlySet<string>>(() => new Set());
  const [realtimeSoftError, setRealtimeSoftError] = useState(false);

  const lastProcessedIsoRef = useRef<string | null>(null);
  const syncInitializedRef = useRef(false);
  const lastStructureRef = useRef("");
  const lastCompletionMapRef = useRef<Map<string, string>>(new Map());
  const remoteClearTimeoutRef = useRef<number>(0);
  const freshnessClearTimeoutRef = useRef<number>(0);
  const highlightClearTimeoutRef = useRef<number>(0);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!shareToken.trim()) {
      setShareCtx(null);
      setShareResolved(true);
      return;
    }
    setLoadError(null);
    setShareResolved(false);
    const unsub = shareRepository.subscribeActiveShareByToken(
      shareToken,
      (next) => {
        setShareCtx(next);
        setShareResolved(true);
        if (!next) {
          setTrip(null);
          setDayPlans([]);
        }
      },
      () => {
        setShareResolved(true);
        setLoadError(t("share.loadError"));
      },
    );
    return () => unsub();
  }, [shareToken, t]);

  useEffect(() => {
    const tripId = shareCtx?.tripId;
    lastProcessedIsoRef.current = null;
    syncInitializedRef.current = false;
    lastStructureRef.current = "";
    lastCompletionMapRef.current = new Map();
    setHasSyncedLive(false);
    setRemotePlanUpdating(false);
    setFreshnessVisible(false);
    setCompletionHighlightIds(new Set());
    setRealtimeSoftError(false);
    window.clearTimeout(remoteClearTimeoutRef.current);
    window.clearTimeout(freshnessClearTimeoutRef.current);
    window.clearTimeout(highlightClearTimeoutRef.current);

    if (!tripId) {
      setTrip(null);
      setDayPlans([]);
      setRealtimeMeta(null);
      return;
    }
    setLoadError(null);
    setRealtimeSoftError(false);
    const unsub = subscribeTripRealtime(tripId, {
      onNext: (bundle) => {
        setTrip(bundle.trip);
        if (bundle.hydrated) {
          setDayPlans(bundle.dayPlans);
        }
        setRealtimeMeta({
          connection: bundle.connection,
          lastUpdatedIso: bundle.lastUpdatedIso,
          hydrated: bundle.hydrated,
        });
        if (bundle.connection === "live" && bundle.hydrated) {
          setRealtimeSoftError(false);
        }
      },
      onError: () => {
        setRealtimeSoftError(true);
      },
    });
    return () => unsub();
  }, [shareCtx?.tripId]);

  useEffect(() => {
    if (realtimeMeta?.connection === "live") {
      setHasSyncedLive(true);
    }
  }, [realtimeMeta?.connection]);

  useEffect(() => {
    return () => {
      window.clearTimeout(remoteClearTimeoutRef.current);
      window.clearTimeout(freshnessClearTimeoutRef.current);
      window.clearTimeout(highlightClearTimeoutRef.current);
    };
  }, []);

  const share = shareCtx?.share ?? null;

  const { viewTrip, viewDays } = useMemo(() => {
    if (!trip || !share) {
      return { viewTrip: null as Trip | null, viewDays: [] as DayPlan[] };
    }
    return {
      viewTrip: redactTripForShare(trip, share),
      viewDays: sanitizeDayPlansForShare(dayPlans, share),
    };
  }, [trip, dayPlans, share]);

  useEffect(() => {
    if (!shareCtx?.tripId || !realtimeMeta?.hydrated) {
      return;
    }

    const iso = realtimeMeta.lastUpdatedIso;
    if (!iso) {
      if (dayPlans.length > 0 && !syncInitializedRef.current) {
        syncInitializedRef.current = true;
        lastStructureRef.current = structureSignature(dayPlans);
        lastCompletionMapRef.current = completionByBlock(dayPlans);
      }
      return;
    }
    if (iso === lastProcessedIsoRef.current) {
      return;
    }
    lastProcessedIsoRef.current = iso;

    const structure = structureSignature(dayPlans);
    const nextCompletion = completionByBlock(dayPlans);

    if (!syncInitializedRef.current) {
      syncInitializedRef.current = true;
      lastStructureRef.current = structure;
      lastCompletionMapRef.current = nextCompletion;
      return;
    }

    const structChanged = structure !== lastStructureRef.current;
    const changedCompletionIds = diffCompletionChangedIds(lastCompletionMapRef.current, nextCompletion);
    const compChanged = changedCompletionIds.length > 0;

    lastStructureRef.current = structure;
    lastCompletionMapRef.current = nextCompletion;

    if (!structChanged && !compChanged) {
      return;
    }

    if (structChanged) {
      setRemotePlanUpdating(true);
      window.clearTimeout(remoteClearTimeoutRef.current);
      remoteClearTimeoutRef.current = window.setTimeout(() => setRemotePlanUpdating(false), 5200);
    }

    if (compChanged) {
      setFreshnessVisible(true);
      window.clearTimeout(freshnessClearTimeoutRef.current);
      freshnessClearTimeoutRef.current = window.setTimeout(() => setFreshnessVisible(false), 2800);
    }

    if (compChanged && share?.includeLiveStatus && !structChanged && changedCompletionIds.length > 0) {
      setCompletionHighlightIds(new Set(changedCompletionIds));
      window.clearTimeout(highlightClearTimeoutRef.current);
      highlightClearTimeoutRef.current = window.setTimeout(() => setCompletionHighlightIds(new Set()), 950);
    }
  }, [dayPlans, realtimeMeta?.hydrated, realtimeMeta?.lastUpdatedIso, shareCtx?.tripId, share?.includeLiveStatus]);

  const hideCosts = share ? !share.includeCosts : true;
  const hideDocumentHints = share ? !share.includeDocuments : true;

  const shareLiveDay = useMemo(
    () => (viewTrip ? pickLiveDayId(viewTrip, viewDays, nowTick) : null),
    [viewTrip, viewDays, nowTick],
  );

  const shareTimelineProgress = useMemo(() => {
    if (!shareLiveDay || !viewTrip) {
      return null;
    }
    const { completed, skipped } = completionIdsFromDay(shareLiveDay);
    const state = buildExecutionStateFromDay(shareLiveDay, viewTrip, {
      nowIso: nowTick.toISOString(),
      completedIds: completed,
      skippedIds: skipped,
    });
    return calculateTimelineProgress(state);
  }, [shareLiveDay, viewTrip, nowTick]);

  const shareProgressTimeZone = useMemo(
    () => (shareLiveDay && viewTrip ? resolvePlanTimezone(viewTrip, shareLiveDay.segmentId) : undefined),
    [shareLiveDay, viewTrip],
  );

  const connectionChip = useMemo(() => {
    if (!realtimeMeta?.hydrated) {
      return { label: t("trips.realtime.connectionConnecting"), color: "default" as const };
    }
    switch (realtimeMeta.connection) {
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
  }, [realtimeMeta, t]);

  const lastUpdatedLabel = useMemo(() => {
    const iso = realtimeMeta?.lastUpdatedIso;
    if (!iso) {
      return null;
    }
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) {
      return null;
    }
    return t("trips.realtime.lastUpdated", { when: d.toLocaleString() });
  }, [realtimeMeta?.lastUpdatedIso, t]);

  const showReconnectBanner = Boolean(
    realtimeMeta?.hydrated &&
      hasSyncedLive &&
      (realtimeMeta.connection === "connecting" ||
        realtimeMeta.connection === "offline_cached" ||
        realtimeMeta.connection === "error"),
  );

  const showDegradedLine = Boolean(realtimeSoftError && !showReconnectBanner);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "var(--wm-color-bg-root, #030b13)",
        color: "text.primary",
        py: { xs: 2, sm: 3 },
        px: { xs: 1.5, sm: 3 },
        display: "grid",
        gap: { xs: 2, sm: 2.5 },
        alignContent: "start",
        pb: "max(16px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {(showReconnectBanner || remotePlanUpdating) && (
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 24,
            display: "grid",
            gap: 0.75,
            mx: { xs: -0.5, sm: 0 },
          }}
        >
          {showReconnectBanner ? (
            <Alert
              severity="info"
              variant="filled"
              sx={{
                py: 0.5,
                borderRadius: 1,
                boxShadow: (theme) => theme.shadows[3],
                "& .MuiAlert-message": { width: "100%" },
              }}
            >
              <Stack spacing={0.75}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {realtimeMeta?.connection === "error"
                    ? t("share.reconnecting.bannerError")
                    : t("share.reconnecting.banner")}
                </Typography>
                <LinearProgress color="inherit" sx={{ height: 3, borderRadius: 99, opacity: 0.85 }} />
              </Stack>
            </Alert>
          ) : null}
          {remotePlanUpdating ? (
            <Alert
              severity="info"
              variant="outlined"
              icon={<SyncRoundedIcon fontSize="inherit" />}
              sx={{
                py: 0.5,
                borderRadius: 1,
                bgcolor: "rgba(0, 40, 56, 0.45)",
                "& .MuiAlert-message": { width: "100%" },
              }}
            >
              <Stack spacing={0.5}>
                <Typography variant="body2">{t("share.remoteUpdating")}</Typography>
                <LinearProgress sx={{ height: 2, borderRadius: 99 }} />
              </Stack>
            </Alert>
          ) : null}
        </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <BrandLogo />
        <Typography variant="caption" color="text.secondary">
          {productConfig.appName}
        </Typography>
      </Box>

      {!shareToken.trim() ? (
        <EmptyState
          title={t("share.missingLinkTitle")}
          description={t("share.missingLinkDescription")}
          icon={<LinkOffRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />}
        />
      ) : !shareResolved ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress aria-label={t("common.loading")} />
        </Box>
      ) : loadError ? (
        <EmptyState
          title={t("share.linkLoadFailedTitle")}
          description={loadError}
          icon={<LinkOffRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />}
        />
      ) : !shareCtx || !viewTrip ? (
        <EmptyState
          title={t("share.linkUnavailableTitle")}
          description={t("share.linkUnavailableDescription")}
          icon={<LinkOffRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />}
        />
      ) : (
        <>
          {showDegradedLine ? (
            <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2, py: 0.5 }}>
              <Typography variant="body2">{t("share.realtimeStreamError")}</Typography>
            </Alert>
          ) : null}
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
            {t("share.readOnlyBanner")}
          </Alert>
          <Box sx={{ display: "grid", gap: 3 }}>
            <SectionHeader
              title={viewTrip.title}
              subtitle={`${viewTrip.destination} | ${formatUserFriendlyDateRange(viewTrip.dateRange.start, viewTrip.dateRange.end)}`}
              action={
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  flexWrap="wrap"
                  justifyContent={{ xs: "flex-start", sm: "flex-end" }}
                  sx={{ width: { xs: "100%", sm: "auto" }, rowGap: 1 }}
                >
                  <Fade in={freshnessVisible} timeout={280} mountOnEnter unmountOnExit>
                    <Chip
                      size="small"
                      label={t("share.freshness.justNow")}
                      color="success"
                      variant="filled"
                      sx={{ minHeight: 36, fontWeight: 700 }}
                    />
                  </Fade>
                  {lastUpdatedLabel ? (
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: { xs: "left", sm: "right" } }}>
                      {lastUpdatedLabel}
                    </Typography>
                  ) : null}
                  <Chip
                    size="small"
                    label={connectionChip.label}
                    color={connectionChip.color}
                    variant="outlined"
                    sx={{ minHeight: 36, "& .MuiChip-label": { px: 1.25 } }}
                  />
                </Stack>
              }
            />
            <GlassPanel sx={{ p: { xs: 2, sm: 2.5 }, display: "grid", gap: 1.5 }}>
              <Typography variant="h6">{t("trips.cityRoute")}</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {viewTrip.tripSegments.map((segment) => (
                  <MetadataPill
                    key={segment.id}
                    label={`${segment.country ? `${getCountryFlagEmoji(segment.country) ?? ""} ` : ""}${segment.city}${segment.country ? `, ${segment.country}` : ""} · ${formatUserFriendlyDateRange(segment.startDate, segment.endDate)}`.trim()}
                    tone="teal"
                  />
                ))}
              </Box>
            </GlassPanel>
            <IntercityMovesPanel
              moves={viewTrip.intercityMoves ?? []}
              segments={viewTrip.tripSegments}
              hideCosts={hideCosts}
              hideDocumentHints={hideDocumentHints}
            />
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <SectionHeader title={t("trips.days")} />
                <Box sx={{ mt: 2, display: "grid", gap: 2 }}>
                  {shareTimelineProgress ? (
                    <TimelineProgressCard progress={shareTimelineProgress} timeZone={shareProgressTimeZone} />
                  ) : null}
                  <TripCurrentDayPhaseBanner trip={viewTrip} dayPlans={viewDays} />
                  <DayPlanTimeline
                    dayPlans={viewDays}
                    trip={viewTrip}
                    autoScrollToToday
                    scrollSessionKey={shareToken}
                    showHourlyTimeline
                    hourlyShowNowIndicator={Boolean(share?.includeLiveStatus)}
                    hourlyReadonly
                    doneLabel={t("completion.done")}
                    skippedLabel={t("completion.skipped")}
                    hideCosts={hideCosts}
                    completionHighlightBlockIds={completionHighlightIds}
                  />
                </Box>
              </Grid>
            </Grid>
          </Box>
        </>
      )}
    </Box>
  );
};
