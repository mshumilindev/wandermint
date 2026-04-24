import { create } from "zustand";
import type { FamiliarityMode, PlaceExperienceMemory, PlaceMemoryActionInput, TravelPartyContext } from "../../entities/place-memory/model";
import type { PlaceSnapshot } from "../../entities/activity/model";
import { placeExperienceMemoriesRepository } from "../../services/firebase/repositories/placeExperienceMemoriesRepository";
import { placeExperienceMemoryService } from "../../services/place-memory/placeExperienceMemoryService";
import { getErrorMessage } from "../../shared/lib/errors";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";

interface PlaceMemoryState {
  memoriesById: Record<string, PlaceExperienceMemory>;
  memoryIds: string[];
  memoriesByPlaceKey: Record<string, PlaceExperienceMemory>;
  meta: CacheMeta;
  ensureMemories: (userId: string) => Promise<void>;
  refreshMemories: (userId: string) => Promise<void>;
  applyAction: (input: PlaceMemoryActionInput) => Promise<PlaceExperienceMemory>;
  toggleFavoriteForPlace: (
    userId: string,
    place: PlaceSnapshot,
    options?: { city?: string; country?: string; category?: string; tags?: string[]; travelPartyContext?: TravelPartyContext; value?: boolean },
  ) => Promise<void>;
  setNotInterestedForPlace: (
    userId: string,
    place: PlaceSnapshot,
    value: boolean,
    options?: { city?: string; country?: string; category?: string; tags?: string[]; travelPartyContext?: TravelPartyContext },
  ) => Promise<void>;
  markBeenThereForPlace: (
    userId: string,
    place: PlaceSnapshot,
    options?: { city?: string; country?: string; category?: string; tags?: string[]; travelPartyContext?: TravelPartyContext; completed?: boolean; skipped?: boolean; showToOthersCandidate?: boolean },
  ) => Promise<void>;
  getPlaceStateMap: () => Record<string, PlaceExperienceMemory>;
}

const upsertMemoryState = (
  state: PlaceMemoryState,
  memory: PlaceExperienceMemory,
): Pick<PlaceMemoryState, "memoriesById" | "memoryIds" | "memoriesByPlaceKey"> => ({
  memoriesById: { ...state.memoriesById, [memory.id]: memory },
  memoryIds: state.memoryIds.includes(memory.id) ? state.memoryIds : [memory.id, ...state.memoryIds],
  memoriesByPlaceKey: { ...state.memoriesByPlaceKey, [memory.placeKey]: memory },
});

export const usePlaceMemoryStore = create<PlaceMemoryState>((set, get) => ({
  memoriesById: {},
  memoryIds: [],
  memoriesByPlaceKey: {},
  meta: createIdleCacheMeta(),

  ensureMemories: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    if (isCacheFresh(get().meta, cacheDurations.long)) {
      return;
    }
    await get().refreshMemories(userId);
  },

  refreshMemories: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    set((state) => ({ meta: { ...state.meta, status: "loading", error: null } }));
    try {
      const memories = await placeExperienceMemoriesRepository.getUserPlaceMemories(userId);
      set({
        memoriesById: Object.fromEntries(memories.map((memory) => [memory.id, memory])),
        memoryIds: memories.map((memory) => memory.id),
        memoriesByPlaceKey: Object.fromEntries(memories.map((memory) => [memory.placeKey, memory])),
        meta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
      });
    } catch (error) {
      set((state) => ({ meta: { ...state.meta, status: "error", error: getErrorMessage(error) } }));
    }
  },

  applyAction: async (input) => {
    const existing = get().memoriesByPlaceKey[input.placeKey] ?? await placeExperienceMemoriesRepository.getPlaceMemoryById(placeExperienceMemoryService.createMemoryId(input.userId, input.placeKey));
    const merged = placeExperienceMemoryService.mergeAction(existing, input);
    await placeExperienceMemoriesRepository.savePlaceMemory(merged);
    set((state) => ({
      ...upsertMemoryState(state, merged),
      meta: { ...state.meta, status: "success", isDirty: false, lastFetchedAt: state.meta.lastFetchedAt ?? Date.now() },
    }));
    return merged;
  },

  toggleFavoriteForPlace: async (userId, place, options) => {
    const baseInput = placeExperienceMemoryService.createActionInputFromPlace(userId, place, {
      city: options?.city,
      country: options?.country,
      category: options?.category,
      tags: options?.tags,
      travelPartyContext: options?.travelPartyContext,
      happenedAt: new Date().toISOString(),
    });
    const current = get().memoriesByPlaceKey[baseInput.placeKey];
    const existing = current ?? placeExperienceMemoryService.createEmptyMemory(baseInput);
    const next = placeExperienceMemoryService.toggleFavorite(existing, options?.value ?? !existing.isFavorite);
    await placeExperienceMemoriesRepository.savePlaceMemory(next);
    set((state) => ({
      ...upsertMemoryState(state, next),
      meta: { ...state.meta, status: "success", isDirty: false, lastFetchedAt: state.meta.lastFetchedAt ?? Date.now() },
    }));
  },

  setNotInterestedForPlace: async (userId, place, value, options) => {
    const baseInput = placeExperienceMemoryService.createActionInputFromPlace(userId, place, {
      city: options?.city,
      country: options?.country,
      category: options?.category,
      tags: options?.tags,
      travelPartyContext: options?.travelPartyContext,
      happenedAt: new Date().toISOString(),
    });
    const current = get().memoriesByPlaceKey[baseInput.placeKey];
    const existing = current ?? placeExperienceMemoryService.createEmptyMemory(baseInput);
    const next = placeExperienceMemoryService.setNotInterested(existing, value);
    await placeExperienceMemoriesRepository.savePlaceMemory(next);
    set((state) => ({
      ...upsertMemoryState(state, next),
      meta: { ...state.meta, status: "success", isDirty: false, lastFetchedAt: state.meta.lastFetchedAt ?? Date.now() },
    }));
  },

  markBeenThereForPlace: async (userId, place, options) => {
    await get().applyAction(
      placeExperienceMemoryService.createActionInputFromPlace(userId, place, {
        city: options?.city,
        country: options?.country,
        category: options?.category,
        tags: options?.tags,
        travelPartyContext: options?.travelPartyContext,
        completed: options?.completed,
        skipped: options?.skipped,
        showToOthersCandidate: options?.showToOthersCandidate,
        happenedAt: new Date().toISOString(),
      }),
    );
  },

  getPlaceStateMap: () => get().memoriesByPlaceKey,
}));
