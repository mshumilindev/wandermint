import { Box, Button, Chip } from "@mui/material";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityCompletionStatus } from "../../../entities/activity/model";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripDetailsStore } from "../../../app/store/useTripDetailsStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { getCountryFlagEmoji } from "../../../shared/ui/CountryFlag";
import { ActivityBlockCard } from "../components/ActivityBlockCard";
import { DayPlanEditPanel } from "../components/DayPlanEditPanel";
import { MovementLegRow } from "../components/MovementLegRow";
import { ReplanProposalCard } from "../components/ReplanProposalCard";

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
  const proposals = useTripDetailsStore((state) => state.replanProposalsByTripId[tripId] ?? []);
  const pushToast = useUiStore((state) => state.pushToast);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [confirmMarkDoneOpen, setConfirmMarkDoneOpen] = useState(false);
  const [confirmRecoveryOpen, setConfirmRecoveryOpen] = useState(false);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);

  useEffect(() => {
    if (user && tripId) {
      void ensureTripDetails(user.id, tripId);
    }
  }, [ensureTripDetails, tripId, user]);

  const updateStatus = (blockId: string, status: ActivityCompletionStatus): void => {
    void updateActivityCompletion(tripId, dayId, blockId, status).catch(() => {
      pushToast({ tone: "error", message: t("feedback.activityUpdateFailed") });
    });
  };

  if (!day) {
    return <EmptyState title={t("common.empty")} description={t("states.partialData")} />;
  }

  const orderedBlocks = useMemo(
    () =>
      [...day.blocks].sort(
        (left, right) =>
          left.startTime.localeCompare(right.startTime) || left.endTime.localeCompare(right.endTime),
      ),
    [day.blocks],
  );

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
          const nextStartMinutes = previousEndMinutes + 10;
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
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {orderedBlocks.map((block, index) => (
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
        ))}
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
