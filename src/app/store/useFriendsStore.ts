import { create } from "zustand";
import type { AddFriendInput, Friend, UpdateFriendPatch } from "../../entities/friend/model";
import { friendsRepository } from "../../features/friends/friendsRepository";
import { getErrorMessage } from "../../shared/lib/errors";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";

interface FriendsState {
  friendIds: string[];
  friendsById: Record<string, Friend>;
  meta: CacheMeta;
  ensureFriends: (userId: string) => Promise<void>;
  refreshFriends: (userId: string) => Promise<void>;
  addFriend: (userId: string, input: AddFriendInput) => Promise<Friend>;
  updateFriend: (userId: string, friendId: string, patch: UpdateFriendPatch) => Promise<Friend>;
  deleteFriend: (userId: string, friendId: string) => Promise<void>;
}

const toState = (friends: Friend[]): Pick<FriendsState, "friendIds" | "friendsById"> => ({
  friendIds: friends.map((item) => item.id),
  friendsById: Object.fromEntries(friends.map((item) => [item.id, item])),
});

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friendIds: [],
  friendsById: {},
  meta: createIdleCacheMeta(),

  ensureFriends: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    if (isCacheFresh(get().meta, cacheDurations.short)) {
      return;
    }
    await get().refreshFriends(userId);
  },

  refreshFriends: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    set((state) => ({ meta: { ...state.meta, status: "loading", error: null } }));
    try {
      const friends = await friendsRepository.listFriends(userId);
      set({
        ...toState(friends),
        meta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
      });
    } catch (error) {
      set((state) => ({ meta: { ...state.meta, status: "error", error: getErrorMessage(error) } }));
    }
  },

  addFriend: async (userId, input) => {
    const created = await friendsRepository.addFriend(userId, input);
    set((state) => ({
      friendIds: state.friendIds.includes(created.id) ? state.friendIds : [created.id, ...state.friendIds],
      friendsById: { ...state.friendsById, [created.id]: created },
      meta: { ...state.meta, status: "success", isDirty: false, error: null, lastFetchedAt: Date.now() },
    }));
    return created;
  },

  updateFriend: async (userId, friendId, patch) => {
    const updated = await friendsRepository.updateFriend(userId, friendId, patch);
    set((state) => ({
      friendIds: state.friendIds,
      friendsById: { ...state.friendsById, [updated.id]: updated },
      meta: { ...state.meta, status: "success", isDirty: false, error: null, lastFetchedAt: Date.now() },
    }));
    return updated;
  },

  deleteFriend: async (userId, friendId) => {
    await friendsRepository.deleteFriend(userId, friendId);
    set((state) => ({
      friendIds: state.friendIds.filter((id) => id !== friendId),
      friendsById: Object.fromEntries(Object.entries(state.friendsById).filter(([id]) => id !== friendId)),
      meta: { ...state.meta, status: "success", isDirty: false, error: null, lastFetchedAt: Date.now() },
    }));
  },
}));
