import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import type { AddFriendInput, Friend, UpdateFriendPatch } from "../../entities/friend/model";
import { friendSchema } from "../../entities/friend/schemas";
import { firestoreCollections } from "../../shared/config/product";
import { createClientId } from "../../shared/lib/id";
import { firestoreDb } from "../../services/firebase/firebaseApp";

const friendsCollectionRef = (userId: string) => collection(doc(firestoreDb, firestoreCollections.users, userId), firestoreCollections.friends);
const friendDocRef = (userId: string, friendId: string) => doc(friendsCollectionRef(userId), friendId);

const normalizeString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeFriendInput = (input: AddFriendInput): AddFriendInput => ({
  ...input,
  name: input.name.trim(),
  avatarUrl: normalizeString(input.avatarUrl),
  notes: normalizeString(input.notes),
  location: {
    ...input.location,
    label: normalizeString(input.location.label),
    city: input.location.city.trim(),
    country: normalizeString(input.location.country),
    address: normalizeString(input.location.address),
  },
});

const parseFriend = (id: string, raw: unknown): Friend | null => {
  const parsed = friendSchema.safeParse({ id, ...(raw as Record<string, unknown>) });
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
};

export const friendsRepository = {
  listFriends: async (userId: string): Promise<Friend[]> => {
    if (!userId.trim()) {
      return [];
    }
    const snapshot = await getDocs(friendsCollectionRef(userId));
    const friends: Friend[] = [];
    snapshot.docs.forEach((row) => {
      const parsed = parseFriend(row.id, row.data());
      if (parsed) {
        friends.push(parsed);
      }
    });
    return friends.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  addFriend: async (userId: string, input: AddFriendInput): Promise<Friend> => {
    if (!userId.trim()) {
      throw new TypeError("Friend add requires userId.");
    }
    const now = Date.now();
    const next: Friend = {
      id: createClientId("friend"),
      ...normalizeFriendInput(input),
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(friendDocRef(userId, next.id), next);
    return next;
  },

  updateFriend: async (userId: string, friendId: string, patch: UpdateFriendPatch): Promise<Friend> => {
    if (!userId.trim() || !friendId.trim()) {
      throw new TypeError("Friend update requires userId and friendId.");
    }
    const current = await getDoc(friendDocRef(userId, friendId));
    if (!current.exists()) {
      throw new Error("Friend not found.");
    }
    const currentFriend = parseFriend(current.id, current.data());
    if (!currentFriend) {
      throw new Error("Friend data is invalid.");
    }
    const now = Date.now();
    const next: Friend = {
      ...currentFriend,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() : currentFriend.name,
      avatarUrl: patch.avatarUrl !== undefined ? normalizeString(patch.avatarUrl) : currentFriend.avatarUrl,
      notes: patch.notes !== undefined ? normalizeString(patch.notes) : currentFriend.notes,
      location:
        patch.location !== undefined
          ? {
              ...patch.location,
              label: normalizeString(patch.location.label),
              city: patch.location.city.trim(),
              country: normalizeString(patch.location.country),
              address: normalizeString(patch.location.address),
            }
          : currentFriend.location,
      updatedAt: now,
    };
    await setDoc(friendDocRef(userId, friendId), next);
    return next;
  },

  deleteFriend: async (userId: string, friendId: string): Promise<void> => {
    if (!userId.trim() || !friendId.trim()) {
      return;
    }
    await deleteDoc(friendDocRef(userId, friendId));
  },
};
