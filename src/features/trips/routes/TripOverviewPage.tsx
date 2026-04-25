import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import { Box, Button, Grid, Typography } from "@mui/material";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripDetailsStore } from "../../../app/store/useTripDetailsStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { TravelerJourneyView, useTravelerJourneyData } from "../../traveler-journey";
import { useUiStore } from "../../../app/store/useUiStore";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { TripOverviewPageSkeleton } from "../../../shared/ui/skeletons/TripOverviewPageSkeleton";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { getCountryFlagEmoji } from "../../../shared/ui/CountryFlag";
import { DayPlanTimeline } from "../components/DayPlanTimeline";
import { TripCurrentDayPhaseBanner } from "../components/TripCurrentDayPhaseBanner";
import { TripEditPanel } from "../components/TripEditPanel";
import { IntercityMovesPanel } from "../components/IntercityMovesPanel";
import { ReplanProposalCard } from "../components/ReplanProposalCard";
import { TripHealthPanel } from "../components/TripHealthPanel";
import { WarningCard } from "../components/WarningCard";
import { TripShareModal } from "../../share/TripShareModal";
import { calculateTimelineProgress } from "../../timeline-progress/calculateTimelineProgress";
import { TimelineProgressCard } from "../../timeline-progress/TimelineProgressCard";
import { buildExecutionStateFromDay, completionIdsFromDay, pickLiveDayId } from "../execution/buildLiveExecutionModel";
import { resolvePlanTimezone } from "../pacing/planTimeUtils";

export const TripOverviewPage = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { tripId?: string };
  const tripId = params.tripId ?? "";
  const user = useAuthStore((state) => state.user);
  const trip = useTripsStore((state) => state.tripsById[tripId]);
  const ensureTrips = useTripsStore((state) => state.ensureTrips);
  const tripIds = useTripsStore((state) => state.tripIds);
  const tripsById = useTripsStore((state) => state.tripsById);
  const ensureTripDetails = useTripDetailsStore((state) => state.ensureTripDetails);
  const revalidateTrip = useTripDetailsStore((state) => state.revalidateTrip);
  const updateTripCompletion = useTripDetailsStore((state) => state.updateTripCompletion);
  const applyReplanProposal = useTripDetailsStore((state) => state.applyReplanProposal);
  const dismissReplanProposal = useTripDetailsStore((state) => state.dismissReplanProposal);
  const deleteTripCascade = useTripDetailsStore((state) => state.deleteTripCascade);
  const saveTrip = useTripsStore((state) => state.saveTrip);
  const dayIds = useTripDetailsStore((state) => state.tripDayIdsByTripId[tripId] ?? []);
  const dayPlansById = useTripDetailsStore((state) => state.dayPlansById);
  const warnings = useTripDetailsStore((state) => state.warningsByTripId[tripId] ?? []);
  const proposals = useTripDetailsStore((state) => state.replanProposalsByTripId[tripId] ?? []);
  const meta = useTripDetailsStore((state) => state.detailsMetaByTripId[tripId]);
  const pushToast = useUiStore((state) => state.pushToast);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (user && tripId) {
      void ensureTripDetails(user.id, tripId);
    }
  }, [ensureTripDetails, tripId, user]);

  useEffect(() => {
    if (user?.id) {
      void ensureTrips(user.id);
    }
  }, [ensureTrips, user?.id]);

  const allTrips = useMemo(
    () => tripIds.map((id) => tripsById[id]).filter((row): row is NonNullable<typeof row> => Boolean(row)),
    [tripIds, tripsById],
  );
  const { journey, countriesByTripId } = useTravelerJourneyData(user?.id, allTrips);

  const days = dayIds.map((dayId) => dayPlansById[dayId]).filter((day): day is NonNullable<typeof day> => Boolean(day));

  const liveDayForProgress = useMemo(() => pickLiveDayId(trip ?? null, days, nowTick), [trip, days, nowTick]);

  const overviewTimelineProgress = useMemo(() => {
    if (!liveDayForProgress) {
      return null;
    }
    const { completed, skipped } = completionIdsFromDay(liveDayForProgress);
    const state = buildExecutionStateFromDay(liveDayForProgress, trip ?? null, {
      nowIso: nowTick.toISOString(),
      completedIds: completed,
      skippedIds: skipped,
    });
    return calculateTimelineProgress(state);
  }, [liveDayForProgress, trip, nowTick]);

  const overviewProgressTimeZone = useMemo(
    () => (liveDayForProgress ? resolvePlanTimezone(trip ?? null, liveDayForProgress.segmentId) : undefined),
    [liveDayForProgress, trip],
  );

  if (meta?.status === "loading" && !trip) {
    return <TripOverviewPageSkeleton />;
  }

  if (!trip) {
    return <EmptyState title={t("trips.empty")} description={t("states.partialData")} />;
  }

  const handleDelete = async (): Promise<void> => {
    if (!user) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteTripCascade(user.id, tripId);
      pushToast({ tone: "success", message: t("feedback.tripDeleted") });
      setConfirmDeleteOpen(false);
      void navigate({ to: "/trips" });
    } catch {
      pushToast({ tone: "error", message: t("feedback.tripDeleteFailed") });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRevalidate = async (): Promise<void> => {
    if (!user) {
      return;
    }
    try {
      await revalidateTrip(user.id, tripId);
      pushToast({ tone: "success", message: t("feedback.tripRevalidated") });
    } catch {
      pushToast({ tone: "error", message: t("feedback.tripRevalidateFailed") });
    }
  };

  const handleMarkTripDone = async (): Promise<void> => {
    if (!user) {
      return;
    }
    try {
      await updateTripCompletion(user.id, tripId, "completed");
      pushToast({ tone: "success", message: t("feedback.tripMarkedDone") });
    } catch {
      pushToast({ tone: "error", message: t("feedback.tripUpdateFailed") });
    }
  };

  return (
    <>
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader
        title={trip.title}
        subtitle={`${trip.destination} | ${trip.dateRange.start} - ${trip.dateRange.end}`}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" onClick={() => void handleMarkTripDone()}>
              {t("completion.markTripDone")}
            </Button>
            {user ? (
              <Button variant="outlined" startIcon={<ShareRoundedIcon />} onClick={() => setShareModalOpen(true)}>
                {t("share.shareTrip")}
              </Button>
            ) : null}
            <Button variant="outlined" onClick={() => setConfirmEditOpen(true)}>
              {t("common.edit")}
            </Button>
            {user && (trip.status === "completed" || trip.status === "partially_completed" || trip.status === "abandoned" || trip.status === "archived") ? (
              <Button color="error" variant="outlined" onClick={() => setConfirmDeleteOpen(true)}>
                {t("common.delete")}
              </Button>
            ) : null}
            <Button
              variant="outlined"
              startIcon={<TravelExploreRoundedIcon />}
              onClick={() => void navigate({ to: "/trips/$tripId/live", params: { tripId } })}
            >
              {t("trips.live.enter")}
            </Button>
            <Button variant="contained" startIcon={<ForumOutlinedIcon />} onClick={() => void navigate({ to: "/trips/$tripId/chat", params: { tripId } })}>
              {t("trips.chat")}
            </Button>
          </Box>
        }
      />
      <TravelerJourneyView
        journey={journey}
        countriesByTripId={countriesByTripId}
        variant="strip"
        focusTripId={tripId}
      />
      <TripHealthPanel
        title={t("trips.health")}
        warnings={warnings}
        validateLabel={t("trips.validate")}
        onRevalidate={() => void handleRevalidate()}
      />
      <GlassPanel sx={{ p: 2.5, display: "grid", gap: 1.5 }}>
        <Typography variant="h6">{t("trips.cityRoute")}</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {trip.tripSegments.map((segment) => (
            <MetadataPill
              key={segment.id}
              label={`${segment.country ? `${getCountryFlagEmoji(segment.country) ?? ""} ` : ""}${segment.city}${segment.country ? `, ${segment.country}` : ""} · ${segment.startDate} - ${segment.endDate}`.trim()}
              tone="teal"
            />
          ))}
        </Box>
      </GlassPanel>
      <IntercityMovesPanel moves={trip.intercityMoves ?? []} segments={trip.tripSegments} />
      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
          <SectionHeader title={t("trips.days")} />
          <Box sx={{ mt: 2, display: "grid", gap: 2 }}>
            {overviewTimelineProgress ? (
              <TimelineProgressCard progress={overviewTimelineProgress} timeZone={overviewProgressTimeZone} />
            ) : null}
            <TripCurrentDayPhaseBanner trip={trip} dayPlans={days} />
            <DayPlanTimeline
              dayPlans={days}
              trip={trip}
              autoScrollToToday
              scrollSessionKey={tripId}
              showHourlyTimeline
              openLabel={t("common.review")}
              doneLabel={t("completion.done")}
              skippedLabel={t("completion.skipped")}
            />
          </Box>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Box sx={{ display: "grid", gap: 2 }}>
            {warnings.map((warning) => (
              <WarningCard key={warning.id} warning={warning} softenPresentation />
            ))}
            {proposals.map((proposal) => (
              <ReplanProposalCard
                key={proposal.id}
                proposal={proposal}
                onApply={(proposalId) =>
                  void applyReplanProposal(tripId, proposalId).then((result) => {
                    if (!result) {
                      return;
                    }
                    pushToast({
                      tone: result.warnings.length > 0 ? "warning" : "success",
                      message: result.warnings.length > 0 ? `${result.summary} ${result.warnings[0]}` : result.summary,
                    });
                  })
                }
                onDismiss={(proposalId) => void dismissReplanProposal(tripId, proposalId)}
              />
            ))}
          </Box>
        </Grid>
      </Grid>
      <TripEditPanel trip={trip} open={isEditing} onClose={() => setIsEditing(false)} onSave={(nextTrip) => saveTrip(nextTrip)} />
      {user ? (
        <TripShareModal open={shareModalOpen} onClose={() => setShareModalOpen(false)} ownerUserId={user.id} tripId={tripId} />
      ) : null}
    </Box>
    <ConfirmActionDialog
      open={confirmEditOpen}
      title={t("prompts.confirmOpenTripEditTitle")}
      description={t("prompts.confirmOpenTripEditDescription")}
      confirmLabel={t("common.edit")}
      cancelLabel={t("common.cancel")}
      onCancel={() => setConfirmEditOpen(false)}
      onConfirm={() => {
        setConfirmEditOpen(false);
        setIsEditing(true);
      }}
    />
    <ConfirmActionDialog
      open={confirmDeleteOpen}
      title={t("prompts.confirmDeleteTripTitle")}
      description={t("prompts.confirmDeleteTripDescription")}
      impactNote={t("prompts.confirmDeleteTripImpact")}
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      tone="danger"
      isPending={isDeleting}
      onCancel={() => setConfirmDeleteOpen(false)}
      onConfirm={() => void handleDelete()}
    />
    </>
  );
};
