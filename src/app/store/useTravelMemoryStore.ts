import { create } from "zustand";
import type { TravelMemory } from "../../entities/travel-memory/model";
import { invalidateTravelAnalyticsCache } from "../../features/analytics/analyticsRepository";
import { refreshUserAchievements } from "../../features/achievements/achievementTriggers";
import { syncBucketListVisitedFromTravelMemory } from "../../features/bucket-list/bucketListTravelMemorySync";
import { travelMemoriesRepository } from "../../services/firebase/repositories/travelMemoriesRepository";
import { debugLogError, getErrorMessage } from "../../shared/lib/errors";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";

interface TravelMemoryState {
  memoriesById: Record<string, TravelMemory>;
  memoryIds: string[];
  meta: CacheMeta;
  ensureMemories: (userId: string) => Promise<void>;
  refreshMemories: (userId: string) => Promise<void>;
  saveMemory: (memory: TravelMemory) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
}

export const useTravelMemoryStore = create<TravelMemoryState>((set, get) => ({
  memoriesById: {},
  memoryIds: [],
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
      const memories = await travelMemoriesRepository.getUserTravelMemories(userId);
      set({
        memoriesById: Object.fromEntries(memories.map((memory) => [memory.id, memory])),
        memoryIds: memories.map((memory) => memory.id),
        meta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
      });
    } catch (error) {
      set((state) => ({ meta: { ...state.meta, status: "error", error: getErrorMessage(error) } }));
    }
  },

  saveMemory: async (memory) => {
    if (!memory.userId.trim()) {
      return;
    }
    await travelMemoriesRepository.saveTravelMemory(memory);
    set((state) => ({
      memoriesById: { ...state.memoriesById, [memory.id]: memory },
      memoryIds: state.memoryIds.includes(memory.id) ? state.memoryIds : [memory.id, ...state.memoryIds],
      meta: { ...state.meta, status: "success", isDirty: false, lastFetchedAt: state.meta.lastFetchedAt ?? Date.now() },
    }));
    const uid = memory.userId.trim();
    invalidateTravelAnalyticsCache(uid);
    void (async () => {
      try {
        await syncBucketListVisitedFromTravelMemory(uid, memory);
      } catch (error) {
        debugLogError("bucket_list_travel_memory_sync", error);
      }
      try {
        await refreshUserAchievements(uid);
      } catch (error) {
        debugLogError("achievements_travel_memory_refresh", error);
      }
    })();
  },

  deleteMemory: async (memoryId) => {
    if (!memoryId.trim()) {
      return;
    }

    const prev = get().memoriesById[memoryId];
    await travelMemoriesRepository.deleteTravelMemory(memoryId);
    set((state) => {
      const nextMemories = { ...state.memoriesById };
      delete nextMemories[memoryId];

      return {
        memoriesById: nextMemories,
        memoryIds: state.memoryIds.filter((id) => id !== memoryId),
        meta: { ...state.meta, status: "success", isDirty: false, lastFetchedAt: state.meta.lastFetchedAt ?? Date.now() },
      };
    });
    const uid = prev?.userId?.trim();
    if (uid) {
      invalidateTravelAnalyticsCache(uid);
      void refreshUserAchievements(uid).catch((error) => debugLogError("achievements_travel_memory_delete_refresh", error));
    }
  },
}));
