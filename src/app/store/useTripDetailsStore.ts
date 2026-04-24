import { create } from "zustand";
import type { ActivityCompletionStatus } from "../../entities/activity/model";
import type { DayCompletionStatus, DayPlan } from "../../entities/day-plan/model";
import type { TripCompletionStatus } from "../../entities/trip/model";
import type { ReplanProposal } from "../../entities/replan/model";
import type { PlanWarning } from "../../entities/warning/model";
import { completionRecoveryService } from "../../features/completion/services/completionRecoveryService";
import { completionHistoryRepository } from "../../services/firebase/repositories/completionHistoryRepository";
import { tripRevalidationService } from "../../features/revalidation/services/tripRevalidationService";
import { replanProposalsRepository } from "../../services/firebase/repositories/replanProposalsRepository";
import { tripDaysRepository } from "../../services/firebase/repositories/tripDaysRepository";
import { tripWarningsRepository } from "../../services/firebase/repositories/tripWarningsRepository";
import { tripsRepository } from "../../services/firebase/repositories/tripsRepository";
import { movementPlanningService } from "../../services/planning/movementPlanningService";
import { executeReplanProposal, type ReplanExecutionResult } from "../../services/replan/replanExecutor";
import { getErrorMessage } from "../../shared/lib/errors";
import { createClientId } from "../../shared/lib/id";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";
import { useTripsStore } from "./useTripsStore";

interface TripDetailsState {
  dayPlansById: Record<string, DayPlan>;
  tripDayIdsByTripId: Record<string, string[]>;
  warningsByTripId: Record<string, PlanWarning[]>;
  replanProposalsByTripId: Record<string, ReplanProposal[]>;
  detailsMetaByTripId: Record<string, CacheMeta>;
  ensureTripDetails: (userId: string, tripId: string) => Promise<void>;
  refreshTripDetails: (userId: string, tripId: string) => Promise<void>;
  saveDayPlan: (tripId: string, dayPlan: DayPlan) => Promise<void>;
  revalidateTrip: (userId: string, tripId: string) => Promise<void>;
  updateActivityCompletion: (tripId: string, dayId: string, blockId: string, status: ActivityCompletionStatus) => Promise<void>;
  updateDayCompletion: (tripId: string, dayId: string, status: DayCompletionStatus) => Promise<void>;
  updateTripCompletion: (userId: string, tripId: string, status: TripCompletionStatus) => Promise<void>;
  createRecoveryProposal: (dayId: string) => Promise<void>;
  applyReplanProposal: (tripId: string, proposalId: string) => Promise<ReplanExecutionResult | null>;
  dismissReplanProposal: (tripId: string, proposalId: string) => Promise<void>;
  deleteTripCascade: (userId: string, tripId: string) => Promise<void>;
}

const upsertDays = (state: TripDetailsState, tripId: string, days: DayPlan[]): Pick<TripDetailsState, "dayPlansById" | "tripDayIdsByTripId"> => ({
  dayPlansById: {
    ...state.dayPlansById,
    ...Object.fromEntries(days.map((day) => [day.id, day])),
  },
  tripDayIdsByTripId: {
    ...state.tripDayIdsByTripId,
    [tripId]: days.map((day) => day.id),
  },
});

export const useTripDetailsStore = create<TripDetailsState>((set, get) => ({
  dayPlansById: {},
  tripDayIdsByTripId: {},
  warningsByTripId: {},
  replanProposalsByTripId: {},
  detailsMetaByTripId: {},

  ensureTripDetails: async (userId, tripId) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }
    if (isCacheFresh(get().detailsMetaByTripId[tripId], cacheDurations.medium)) {
      return;
    }
    await get().refreshTripDetails(userId, tripId);
  },

  refreshTripDetails: async (userId, tripId) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }
    const currentMeta = get().detailsMetaByTripId[tripId] ?? createIdleCacheMeta();
    set((state) => ({
      detailsMetaByTripId: { ...state.detailsMetaByTripId, [tripId]: { ...currentMeta, status: "loading", error: null } },
    }));

    try {
      const [trip, days, warnings, proposals] = await Promise.all([
        tripsRepository.getTripById(userId, tripId),
        tripDaysRepository.getTripDays(tripId),
        tripWarningsRepository.getTripWarnings(tripId),
        replanProposalsRepository.getTripReplanProposals(tripId),
      ]);

      if (trip) {
        useTripsStore.getState().patchTrip(trip);
      }

      set((state) => ({
        ...upsertDays(state, tripId, days),
        warningsByTripId: { ...state.warningsByTripId, [tripId]: warnings },
        replanProposalsByTripId: { ...state.replanProposalsByTripId, [tripId]: proposals },
        detailsMetaByTripId: {
          ...state.detailsMetaByTripId,
          [tripId]: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
        },
      }));
    } catch (error) {
      set((state) => ({
        detailsMetaByTripId: {
          ...state.detailsMetaByTripId,
          [tripId]: { ...(state.detailsMetaByTripId[tripId] ?? createIdleCacheMeta()), status: "error", error: getErrorMessage(error) },
        },
      }));
    }
  },

  saveDayPlan: async (tripId, dayPlan) => {
    if (!tripId.trim()) {
      return;
    }

    const nextDay: DayPlan = {
      ...dayPlan,
      movementLegs: await movementPlanningService.buildMovementLegs(dayPlan.blocks),
      updatedAt: new Date().toISOString(),
    };
    await tripDaysRepository.saveTripDay(nextDay);
    set((state) => ({
      dayPlansById: { ...state.dayPlansById, [nextDay.id]: nextDay },
      tripDayIdsByTripId: {
        ...state.tripDayIdsByTripId,
        [tripId]: state.tripDayIdsByTripId[tripId]?.includes(nextDay.id) ? state.tripDayIdsByTripId[tripId] : [...(state.tripDayIdsByTripId[tripId] ?? []), nextDay.id],
      },
      detailsMetaByTripId: {
        ...state.detailsMetaByTripId,
        [tripId]: { ...(state.detailsMetaByTripId[tripId] ?? createIdleCacheMeta()), status: "success", isDirty: false, lastFetchedAt: Date.now(), error: null },
      },
    }));
  },

  revalidateTrip: async (userId, tripId) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }
    await get().ensureTripDetails(userId, tripId);
    const trip = useTripsStore.getState().tripsById[tripId];
    const dayIds = get().tripDayIdsByTripId[tripId] ?? [];
    const days = dayIds.map((dayId) => get().dayPlansById[dayId]).filter((day): day is DayPlan => Boolean(day));
    if (!trip) {
      return;
    }

    const warnings = await tripRevalidationService.revalidateTrip(trip, days);
    if (warnings.length > 0) {
      await tripWarningsRepository.saveTripWarnings(warnings);
    }

    set((state) => ({
      warningsByTripId: { ...state.warningsByTripId, [tripId]: warnings },
      detailsMetaByTripId: {
        ...state.detailsMetaByTripId,
        [tripId]: { ...(state.detailsMetaByTripId[tripId] ?? createIdleCacheMeta()), lastValidatedAt: Date.now(), isDirty: false },
      },
    }));
  },

  updateActivityCompletion: async (tripId, dayId, blockId, status) => {
    const currentDay = get().dayPlansById[dayId];
    const currentBlock = currentDay?.blocks.find((block) => block.id === blockId);
    await tripDaysRepository.updateActivityCompletion(tripId, dayId, blockId, status);
    if (currentDay && currentBlock) {
      await completionHistoryRepository.recordCompletionChange({
        id: createClientId("completion"),
        userId: currentDay.userId,
        tripId,
        dayId,
        blockId,
        previousStatus: currentBlock.completionStatus,
        nextStatus: status,
        createdAt: new Date().toISOString(),
      });
    }
    set((state) => {
      const day = state.dayPlansById[dayId];
      if (!day) {
        return state;
      }

      const nextDay = {
        ...day,
        blocks: day.blocks.map((block) => (block.id === blockId ? { ...block, completionStatus: status } : block)),
      };

      return {
        dayPlansById: { ...state.dayPlansById, [dayId]: nextDay },
        detailsMetaByTripId: {
          ...state.detailsMetaByTripId,
          [tripId]: { ...(state.detailsMetaByTripId[tripId] ?? createIdleCacheMeta()), isDirty: false },
        },
      };
    });
  },

  createRecoveryProposal: async (dayId) => {
    const day = get().dayPlansById[dayId];
    if (!day) {
      return;
    }

    const proposal = completionRecoveryService.createUnfinishedDayProposal(day);
    if (!proposal) {
      return;
    }

    await replanProposalsRepository.saveReplanProposal(proposal);
    set((state) => ({
      replanProposalsByTripId: {
        ...state.replanProposalsByTripId,
        [day.tripId]: [proposal, ...(state.replanProposalsByTripId[day.tripId] ?? [])],
      },
    }));
  },

  updateDayCompletion: async (tripId, dayId, status) => {
    const currentDay = get().dayPlansById[dayId];
    await tripDaysRepository.updateDayCompletion(tripId, dayId, status);
    if (currentDay) {
      await completionHistoryRepository.recordCompletionChange({
        id: createClientId("completion"),
        userId: currentDay.userId,
        tripId,
        dayId,
        previousStatus: currentDay.completionStatus,
        nextStatus: status,
        createdAt: new Date().toISOString(),
      });
    }
    set((state) => {
      const day = state.dayPlansById[dayId];
      if (!day) {
        return state;
      }

      return {
        dayPlansById: {
          ...state.dayPlansById,
          [dayId]: { ...day, completionStatus: status },
        },
      };
    });
  },

  updateTripCompletion: async (userId, tripId, status) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }
    const trip = useTripsStore.getState().tripsById[tripId];
    await tripsRepository.updateTripStatus(userId, tripId, status);
    if (trip) {
      await completionHistoryRepository.recordCompletionChange({
        id: createClientId("completion"),
        userId,
        tripId,
        previousStatus: trip.status,
        nextStatus: status,
        createdAt: new Date().toISOString(),
      });
      useTripsStore.getState().patchTrip({ ...trip, status, updatedAt: new Date().toISOString() });
    }
  },

  dismissReplanProposal: async (tripId, proposalId) => {
    await replanProposalsRepository.deleteReplanProposal(proposalId);
    set((state) => ({
      replanProposalsByTripId: {
        ...state.replanProposalsByTripId,
        [tripId]: (state.replanProposalsByTripId[tripId] ?? []).filter((proposal) => proposal.id !== proposalId),
      },
    }));
  },

  applyReplanProposal: async (tripId, proposalId) => {
    const proposal = (get().replanProposalsByTripId[tripId] ?? []).find((candidate) => candidate.id === proposalId);
    if (!proposal) {
      return null;
    }

    const dayIds = get().tripDayIdsByTripId[tripId] ?? [];
    const days = dayIds
      .map((dayId) => get().dayPlansById[dayId])
      .filter((day): day is DayPlan => Boolean(day));
    const execution = await executeReplanProposal({ proposal, days });
    const changedDays = execution.days.filter((day) => days.some((originalDay) => originalDay.id === day.id && originalDay.updatedAt !== day.updatedAt));
    await Promise.all(changedDays.map((day) => tripDaysRepository.saveTripDay(day)));
    await replanProposalsRepository.deleteReplanProposal(proposalId);

    set((state) => ({
      dayPlansById: { ...state.dayPlansById, ...Object.fromEntries(execution.days.map((day) => [day.id, day])) },
      replanProposalsByTripId: {
        ...state.replanProposalsByTripId,
        [tripId]: (state.replanProposalsByTripId[tripId] ?? []).filter((candidate) => candidate.id !== proposalId),
      },
    }));
    return execution;
  },

  deleteTripCascade: async (userId, tripId) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }

    await Promise.all([
      tripDaysRepository.deleteTripDays(tripId),
      tripWarningsRepository.deleteTripWarnings(tripId),
      replanProposalsRepository.deleteTripReplanProposals(tripId),
      tripsRepository.deleteTrip(userId, tripId),
    ]);

    useTripsStore.getState().removeTripFromCache(tripId);

    set((state) => {
      const nextDayPlans = { ...state.dayPlansById };
      const relatedDayIds = state.tripDayIdsByTripId[tripId] ?? [];
      relatedDayIds.forEach((dayId) => {
        delete nextDayPlans[dayId];
      });

      const nextTripDayIds = { ...state.tripDayIdsByTripId };
      delete nextTripDayIds[tripId];

      const nextWarnings = { ...state.warningsByTripId };
      delete nextWarnings[tripId];

      const nextProposals = { ...state.replanProposalsByTripId };
      delete nextProposals[tripId];

      const nextMeta = { ...state.detailsMetaByTripId };
      delete nextMeta[tripId];

      return {
        dayPlansById: nextDayPlans,
        tripDayIdsByTripId: nextTripDayIds,
        warningsByTripId: nextWarnings,
        replanProposalsByTripId: nextProposals,
        detailsMetaByTripId: nextMeta,
      };
    });
  },
}));
