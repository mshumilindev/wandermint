import { create } from "zustand";
import type { TripChatMessage } from "../../services/firebase/repositories/tripChatRepository";
import { tripChatRepository } from "../../services/firebase/repositories/tripChatRepository";
import { replanProposalsRepository } from "../../services/firebase/repositories/replanProposalsRepository";
import { nowIso } from "../../services/firebase/timestampMapper";
import { openAiGatewayClient } from "../../services/ai/openAiGatewayClient";
import { createClientId } from "../../shared/lib/id";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";
import { getErrorMessage } from "../../shared/lib/errors";
import { useTripDetailsStore } from "./useTripDetailsStore";
import { useTripsStore } from "./useTripsStore";

interface TripChatState {
  threadIdByTripId: Record<string, string>;
  messagesByThreadId: Record<string, TripChatMessage[]>;
  metaByThreadId: Record<string, CacheMeta>;
  ensureRecentMessages: (userId: string, tripId: string) => Promise<void>;
  sendMessage: (userId: string, tripId: string, content: string) => Promise<void>;
}

const getThreadId = (tripId: string): string => `thread_${tripId}`;

export const useTripChatStore = create<TripChatState>((set, get) => ({
  threadIdByTripId: {},
  messagesByThreadId: {},
  metaByThreadId: {},

  ensureRecentMessages: async (userId, tripId) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }
    const threadId = getThreadId(tripId);
    if (isCacheFresh(get().metaByThreadId[threadId], cacheDurations.long)) {
      return;
    }

    set((state) => ({
      threadIdByTripId: { ...state.threadIdByTripId, [tripId]: threadId },
      metaByThreadId: { ...state.metaByThreadId, [threadId]: { ...(state.metaByThreadId[threadId] ?? createIdleCacheMeta()), status: "loading", error: null } },
    }));

    try {
      const messages = await tripChatRepository.getRecentMessages(tripId, threadId);
      set((state) => ({
        messagesByThreadId: { ...state.messagesByThreadId, [threadId]: messages },
        metaByThreadId: { ...state.metaByThreadId, [threadId]: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null } },
      }));
    } catch (error) {
      set((state) => ({
        metaByThreadId: { ...state.metaByThreadId, [threadId]: { ...(state.metaByThreadId[threadId] ?? createIdleCacheMeta()), status: "error", error: getErrorMessage(error) } },
      }));
    }
  },

  sendMessage: async (userId, tripId, content) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }
    const threadId = getThreadId(tripId);
    const optimisticUserMessage: TripChatMessage = {
      id: createClientId("local_message"),
      userId,
      tripId,
      threadId,
      role: "user",
      content,
      createdAt: nowIso(),
    };

    set((state) => ({
      threadIdByTripId: { ...state.threadIdByTripId, [tripId]: threadId },
      messagesByThreadId: { ...state.messagesByThreadId, [threadId]: [...(state.messagesByThreadId[threadId] ?? []), optimisticUserMessage] },
    }));

    try {
      const savedUserMessage = await tripChatRepository.appendMessage({
        userId,
        tripId,
        threadId,
        role: "user",
        content,
      });
      const trip = useTripsStore.getState().tripsById[tripId];
      const detailsState = useTripDetailsStore.getState();
      const dayIds = detailsState.tripDayIdsByTripId[tripId] ?? [];
      const days = dayIds.map((dayId) => detailsState.dayPlansById[dayId]).filter(Boolean);
      const warnings = detailsState.warningsByTripId[tripId] ?? [];

      const aiResponse = await openAiGatewayClient.reviseTripFromChat({
        trip,
        days,
        warnings,
        recentMessages: [...(get().messagesByThreadId[threadId] ?? []), savedUserMessage].slice(-12),
        userRequest: content,
      });

      if (aiResponse.proposal) {
        const proposal = aiResponse.proposal;
        await replanProposalsRepository.saveReplanProposal(proposal);
        useTripDetailsStore.setState((state) => ({
          replanProposalsByTripId: {
            ...state.replanProposalsByTripId,
            [tripId]: [proposal, ...(state.replanProposalsByTripId[tripId] ?? [])],
          },
        }));
      }

      const assistantMessage = await tripChatRepository.appendMessage({
        userId,
        tripId,
        threadId,
        role: "assistant",
        content: aiResponse.assistantMessage,
        structuredPatchSummary: aiResponse.structuredPatchSummary,
      });

      set((state) => ({
        messagesByThreadId: {
          ...state.messagesByThreadId,
          [threadId]: [...(state.messagesByThreadId[threadId] ?? []).filter((message) => message.id !== optimisticUserMessage.id), savedUserMessage, assistantMessage],
        },
        metaByThreadId: {
          ...state.metaByThreadId,
          [threadId]: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
        },
      }));
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      set((state) => ({
        metaByThreadId: {
          ...state.metaByThreadId,
          [threadId]: { ...(state.metaByThreadId[threadId] ?? createIdleCacheMeta()), status: "error", error: errorMessage },
        },
        messagesByThreadId: {
          ...state.messagesByThreadId,
          [threadId]: (state.messagesByThreadId[threadId] ?? []).filter((message) => message.id !== optimisticUserMessage.id),
        },
      }));
      throw error;
    }
  },
}));
