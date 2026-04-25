import { Box, Button, Chip } from "@mui/material";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityBlock, ActivityCompletionStatus } from "../../../entities/activity/model";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripDetailsStore } from "../../../app/store/useTripDetailsStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { nowIso } from "../../../services/firebase/timestampMapper";
import { buildGoogleMapsDirectionsUrl } from "../../../shared/lib/googleMapsDirectionsUrl";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { getCountryFlagEmoji } from "../../../shared/ui/CountryFlag";
import { ActivityBlockCard } from "../components/ActivityBlockCard";
import { DayPlanEditPanel } from "../components/DayPlanEditPanel";
import { MovementLegRow } from "../components/MovementLegRow";
import { PlanSuggestionBar } from "../components/PlanSuggestionBar";
import { ReplanProposalCard } from "../components/ReplanProposalCard";
import { findCurrentBlockIndex, cooldownKeyFor, getUnifiedPlanSuggestion } from "../pacing/planSuggestionEngine";
import { estimateInterBlockWalkingGapMinutes } from "../../transport/transportTimeResolver";
import { resolvePlanTimezone } from "../pacing/planTimeUtils";
import { usePlanOverlayStore } from "../hooks/usePlanOverlayStore";
import { stableActivityKey } from "../visited/activityKey";
import { emptyTripPlanOverlay } from "../visited/planOverlayModel";
import { assessActivityBlockSafety } from "../../safety/safetyRules";
import type { VisitMarkSource } from "../visited/planOverlayModel";

const findBlockByActivityKey = (
  tripId: string,
  planDayId: string,
  dayIndex: number,
  orderedBlocks: ActivityBlock[],
  activityKey: string,
): ActivityBlock | null => {
  for (let i = 0; i < orderedBlocks.length; i += 1) {
    const block = orderedBlocks[i];
    if (block && stableActivityKey(tripId, planDayId, dayIndex, i, block) === activityKey) {
      return block;
    }
  }
  return null;
};

export const DayPlanPage = (): JSX.Element => {
  const { t } = useTranslation();
  const params = useParams({ strict: false }) as { tripId?: string; dayId?: string };
  const tripId = params.tripId ?? "";
  const dayId = params.dayId ?? "";
  const user = useAuthStore((state) => state.user);
  const ensureTripDetails = useTripDetailsStore((state) => state.ensureTripDetails);
  const updateActivityCompletion = useTripDetailsStore((state) => state.updateActivityCompletion);
  const updateDayCompletion = useTripDetailsStore((state) => state.updateDayCompletion);
  const saveDayPlan = useTripDetailsStore((state) => state.saveDayPlan);
  const createRecoveryProposal = useTripDetailsStore((state) => state.createRecoveryProposal);
  const applyReplanProposal = useTripDetailsStore((state) => state.applyReplanProposal);
  const dismissReplanProposal = useTripDetailsStore((state) => state.dismissReplanProposal);
  const day = useTripDetailsStore((state) => state.dayPlansById[dayId]);
  const dayIds = useTripDetailsStore((state) => state.tripDayIdsByTripId[tripId] ?? []);
  const proposals = useTripDetailsStore((state) => state.replanProposalsByTripId[tripId] ?? []);
  const trip = useTripsStore((state) => state.tripsById[tripId]);
  const overlaySlice = usePlanOverlayStore((state) => (tripId ? state.overlays[tripId] : undefined));
  const setActivityPatch = usePlanOverlayStore((state) => state.setActivityPatch);
  const dismissFingerprint = usePlanOverlayStore((state) => state.dismissFingerprint);
  const recordCooldown = usePlanOverlayStore((state) => state.recordCooldown);
  const appendInsertedStub = usePlanOverlayStore((state) => state.appendInsertedStub);
  const pushToast = useUiStore((state) => state.pushToast);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [confirmMarkDoneOpen, setConfirmMarkDoneOpen] = useState(false);
  const [confirmRecoveryOpen, setConfirmRecoveryOpen] = useState(false);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [planClock, setPlanClock] = useState(() => new Date());

  useEffect(() => {
    if (user && tripId) {
      void ensureTripDetails(user.id, tripId);
    }
  }, [ensureTripDetails, tripId, user]);

  useEffect(() => {
    const id = window.setInterval(() => setPlanClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const orderedBlocks = useMemo(() => {
    if (!day) {
      return [];
    }
    return [...day.blocks].sort(
      (left, right) =>
        left.startTime.localeCompare(right.startTime) || left.endTime.localeCompare(right.endTime),
    );
  }, [day]);

  const dayMapsUrl = useMemo(
    () =>
      buildGoogleMapsDirectionsUrl(
        orderedBlocks
          .map((block) => block.place)
          .filter((place): place is NonNullable<ActivityBlock["place"]> =>
            Boolean(place && place.latitude !== undefined && place.longitude !== undefined),
          ),
      ),
    [orderedBlocks],
  );

  const dayIndex = useMemo(() => {
    if (!day) {
      return 0;
    }
    const i = dayIds.indexOf(day.id);
    return i >= 0 ? i : 0;
  }, [day, dayIds]);

  const timeZone = useMemo(
    () => (day ? resolvePlanTimezone(trip, day.segmentId) : "UTC"),
    [day, trip],
  );

  const overlay = useMemo(() => overlaySlice ?? emptyTripPlanOverlay(), [overlaySlice]);

  const overlayByKey = useMemo(() => overlay.activities, [overlay.activities]);

  const planDayId = day?.id ?? dayId;
  const activityKeyFn = useCallback(
    (dIdx: number, bIdx: number, block: ActivityBlock) => stableActivityKey(tripId, planDayId, dIdx, bIdx, block),
    [tripId, planDayId],
  );

  const minuteBucket = Math.floor(planClock.getTime() / 60_000);

  const suggestion = useMemo(() => {
    if (!day || !tripId) {
      return null;
    }
    return getUnifiedPlanSuggestion({
      tripId,
      day,
      dayIndex,
      orderedBlocks,
      overlay,
      overlayByKey,
      activityKey: activityKeyFn,
      now: planClock,
      timeZone,
    });
  }, [tripId, day, dayIndex, orderedBlocks, overlay, overlayByKey, activityKeyFn, planClock, timeZone, minuteBucket]);

  const updateStatus = (blockId: string, status: ActivityCompletionStatus): void => {
    void updateActivityCompletion(tripId, dayId, blockId, status).catch(() => {
      pushToast({ tone: "error", message: t("feedback.activityUpdateFailed") });
    });
  };

  const handleDismissSuggestion = (fingerprint: string, cooldownKey: string): void => {
    dismissFingerprint(tripId, fingerprint);
    recordCooldown(tripId, cooldownKey, new Date());
  };

  const handleMarkVisitedSuggested = (activityKey: string, source: VisitMarkSource): void => {
    if (!day) {
      return;
    }
    const block = findBlockByActivityKey(tripId, day.id, dayIndex, orderedBlocks, activityKey);
    if (!block) {
      return;
    }
    setActivityPatch(tripId, activityKey, {
      visited: true,
      visitedAt: nowIso(),
      source,
    });
    recordCooldown(tripId, cooldownKeyFor("visit_prompt", activityKey), new Date());
    void updateActivityCompletion(tripId, day.id, block.id, "done").catch(() => {
      pushToast({ tone: "error", message: t("feedback.activityUpdateFailed") });
    });
  };

  const handleSkipSuggested = (activityKey: string): void => {
    if (!day) {
      return;
    }
    const block = findBlockByActivityKey(tripId, day.id, dayIndex, orderedBlocks, activityKey);
    if (!block) {
      return;
    }
    setActivityPatch(tripId, activityKey, {
      skipped: true,
      skippedAt: nowIso(),
      source: "suggested_skip",
    });
    recordCooldown(tripId, cooldownKeyFor("skip_prompt"), new Date());
    void updateActivityCompletion(tripId, day.id, block.id, "skipped").catch(() => {
      pushToast({ tone: "error", message: t("feedback.activityUpdateFailed") });
    });
  };

  const handleInsertSuggested = (
    afterActivityKey: string,
    title: string,
    category: string,
    durationMinutes: number,
  ): void => {
    appendInsertedStub(tripId, {
      afterActivityKey,
      title,
      category,
      durationMinutes,
    });
    recordCooldown(tripId, cooldownKeyFor("insert_prompt"), new Date());
  };

  const handleRestSuggested = (variant: "park" | "cafe"): void => {
    if (!day || orderedBlocks.length === 0) {
      return;
    }
    const curIdx = findCurrentBlockIndex(day, orderedBlocks, planClock, timeZone);
    const current = orderedBlocks[curIdx];
    if (!current) {
      return;
    }
    const key = activityKeyFn(dayIndex, curIdx, current);
    appendInsertedStub(tripId, {
      afterActivityKey: key,
      title: variant === "park" ? "Park break" : "Coffee break",
      category: variant === "park" ? "park" : "cafe",
      durationMinutes: 25,
    });
    recordCooldown(tripId, cooldownKeyFor("rest_prompt"), new Date());
  };

  const acknowledgeSafety = useCallback(
    async (blockId: string) => {
      const current = useTripDetailsStore.getState().dayPlansById[dayId];
      if (!current) {
        return;
      }
      const next = {
        ...current,
        blocks: current.blocks.map((b) => (b.id === blockId ? { ...b, safetyWarningAcknowledged: true } : b)),
      };
      try {
        await saveDayPlan(tripId, next);
        pushToast({ tone: "success", message: t("trips.safety.acknowledgedToast") });
      } catch {
        pushToast({ tone: "error", message: t("feedback.daySaveFailed") });
      }
    },
    [dayId, pushToast, saveDayPlan, t, tripId],
  );

  if (!day) {
    return <EmptyState title={t("common.empty")} description={t("states.partialData")} />;
  }

  const handleMarkDone = async (): Promise<void> => {
    try {
      await updateDayCompletion(tripId, day.id, "done");
      pushToast({ tone: "success", message: t("feedback.dayMarkedDone") });
    } catch {
      pushToast({ tone: "error", message: t("feedback.dayUpdateFailed") });
    } finally {
      setConfirmMarkDoneOpen(false);
    }
  };

  const handleCreateRecovery = async (): Promise<void> => {
    try {
      await createRecoveryProposal(day.id);
      pushToast({ tone: "info", message: t("feedback.recoveryCreated") });
    } catch {
      pushToast({ tone: "error", message: t("feedback.recoveryFailed") });
    } finally {
      setConfirmRecoveryOpen(false);
    }
  };

  const moveBlock = async (sourceBlockId: string, targetBlockId: string): Promise<void> => {
    if (sourceBlockId === targetBlockId) {
      return;
    }

    const sourceIndex = orderedBlocks.findIndex((block) => block.id === sourceBlockId);
    const targetIndex = orderedBlocks.findIndex((block) => block.id === targetBlockId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const reordered = [...orderedBlocks];
    const [movedBlock] = reordered.splice(sourceIndex, 1);
    if (!movedBlock) {
      return;
    }
    reordered.splice(targetIndex, 0, movedBlock);

    try {
      await saveDayPlan(tripId, {
        ...day,
        blocks: reordered.map((block, index) => {
          const previousBlock = reordered[index - 1];
          if (!previousBlock) {
            return block;
          }
          const durationMinutes =
            Math.max(
              15,
              Number(block.endTime.slice(0, 2)) * 60 +
                Number(block.endTime.slice(3, 5)) -
                (Number(block.startTime.slice(0, 2)) * 60 + Number(block.startTime.slice(3, 5))),
            );
          const previousEndMinutes =
            Number(previousBlock.endTime.slice(0, 2)) * 60 + Number(previousBlock.endTime.slice(3, 5));
          const travelGap = estimateInterBlockWalkingGapMinutes(
            previousBlock.place?.latitude !== undefined && previousBlock.place?.longitude !== undefined
              ? { lat: previousBlock.place.latitude, lng: previousBlock.place.longitude }
              : undefined,
            block.place?.latitude !== undefined && block.place?.longitude !== undefined
              ? { lat: block.place.latitude, lng: block.place.longitude }
              : undefined,
            `${day.date}T${previousBlock.endTime}`,
          );
          const nextStartMinutes = previousEndMinutes + travelGap;
          const nextEndMinutes = nextStartMinutes + durationMinutes;
          const format = (value: number): string =>
            `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

          return index <= sourceIndex && index <= targetIndex
            ? block
            : {
                ...block,
                startTime: format(nextStartMinutes),
                endTime: format(nextEndMinutes),
              };
        }),
      });
      pushToast({ tone: "success", message: "The day order has been updated." });
    } catch {
      pushToast({ tone: "error", message: t("feedback.daySaveFailed") });
    }
  };

  return (
    <>
      <Box sx={{ display: "grid", gap: 3 }}>
        <SectionHeader
          title={day.theme}
          subtitle={`${day.countryLabel ? `${getCountryFlagEmoji(day.countryLabel) ?? ""} ` : ""}${day.cityLabel}${day.countryLabel ? `, ${day.countryLabel}` : ""} · ${day.date}`.trim()}
          action={
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {dayMapsUrl ? (
                <Button
                  variant="outlined"
                  href={dayMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("common.openInGoogleMaps")}
                </Button>
              ) : null}
              <Button variant="outlined" onClick={() => setConfirmMarkDoneOpen(true)}>
                {t("completion.markDayDone")}
              </Button>
              <Button variant="outlined" onClick={() => setConfirmEditOpen(true)}>
                {t("common.edit")}
              </Button>
              <Button variant="contained" onClick={() => setConfirmRecoveryOpen(true)}>
                {t("completion.recover")}
              </Button>
            </Box>
          }
        />
        {day.adjustment ? <Chip label={t(`editDay.adjustments.${day.adjustment.state}`)} sx={{ width: "fit-content" }} /> : null}
        {suggestion ? (
          <PlanSuggestionBar
            suggestion={suggestion}
            onDismiss={handleDismissSuggestion}
            onMarkVisited={handleMarkVisitedSuggested}
            onSkip={handleSkipSuggested}
            onInsert={handleInsertSuggested}
            onRest={handleRestSuggested}
          />
        ) : null}
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {orderedBlocks.map((block, index) => {
            const activityKey = stableActivityKey(tripId, day.id, dayIndex, index, block);
            const visitOverlay = overlay.activities[activityKey];
            const insertedAfter = overlay.inserted.filter((row) => row.afterActivityKey === activityKey);
            const prevBlock = index > 0 ? orderedBlocks[index - 1] : undefined;
            const inboundLeg = prevBlock
              ? day.movementLegs?.find((leg) => leg.fromBlockId === prevBlock.id && leg.toBlockId === block.id)
              : undefined;
            const safetyAssessment = assessActivityBlockSafety(block, inboundLeg);
            return (
              <Box
                key={block.id}
                draggable
                onDragStart={() => setDraggingBlockId(block.id)}
                onDragEnd={() => setDraggingBlockId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => draggingBlockId && void moveBlock(draggingBlockId, block.id)}
                sx={{
                  display: "grid",
                  gap: 1.25,
                  opacity: draggingBlockId === block.id ? 0.72 : 1,
                  transition: "opacity 160ms ease, transform 160ms ease",
                }}
              >
                <ActivityBlockCard
                  block={block}
                  doneLabel={t("completion.done")}
                  skippedLabel={t("completion.skipped")}
                  safetyAssessment={safetyAssessment}
                  onSafetyAcknowledge={() => void acknowledgeSafety(block.id)}
                  visitOverlay={visitOverlay}
                  insertedAfter={insertedAfter}
                  onStatusChange={(status) => updateStatus(block.id, status)}
                />
                {index < orderedBlocks.length - 1
                  ? (() => {
                      const nextBlock = orderedBlocks[index + 1];
                      const leg = day.movementLegs?.find((item) => item.fromBlockId === block.id && item.toBlockId === nextBlock?.id);
                      return leg ? <MovementLegRow leg={leg} /> : null;
                    })()
                  : null}
              </Box>
            );
          })}
        </Box>
        {proposals.filter((proposal) => proposal.sourceDayId === day.id).map((proposal) => (
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
        <DayPlanEditPanel day={day} open={isEditing} onClose={() => setIsEditing(false)} onSave={(nextDay) => saveDayPlan(tripId, nextDay)} />
      </Box>
      <ConfirmActionDialog
        open={confirmEditOpen}
        title={t("prompts.confirmOpenDayEditTitle")}
        description={t("prompts.confirmOpenDayEditDescription")}
        confirmLabel={t("common.edit")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmEditOpen(false)}
        onConfirm={() => {
          setConfirmEditOpen(false);
          setIsEditing(true);
        }}
      />
      <ConfirmActionDialog
        open={confirmMarkDoneOpen}
        title={t("prompts.confirmMarkDayDoneTitle")}
        description={t("prompts.confirmMarkDayDoneDescription")}
        confirmLabel={t("completion.markDayDone")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmMarkDoneOpen(false)}
        onConfirm={() => void handleMarkDone()}
      />
      <ConfirmActionDialog
        open={confirmRecoveryOpen}
        title={t("prompts.confirmRecoveryTitle")}
        description={t("prompts.confirmRecoveryDescription")}
        impactNote={t("prompts.confirmRecoveryImpact")}
        confirmLabel={t("completion.recover")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmRecoveryOpen(false)}
        onConfirm={() => void handleCreateRecovery()}
      />
    </>
  );
};
