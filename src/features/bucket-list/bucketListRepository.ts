import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { timestampToIso } from "../../services/firebase/timestampMapper";
import type { BucketListItem } from "./bucketList.types";
import { parseBucketListDocument, serializeBucketListDocument } from "./bucketListNormalize";

/**
 * Firestore layout: `users/{userId}/bucketList/{itemId}` — each list row is its own document
 * (the logical `items` collection). Firestore has no bare `/items/` segment without an extra
 * parent doc; this matches the same intent as `users/{userId}/bucketList/items/{itemId}`.
 * Independent of the `trips` collection (Rule 1).
 */
const itemDocRef = (userId: string, itemId: string) =>
  doc(collection(doc(firestoreDb, firestoreCollections.users, userId), "bucketList"), itemId);

const parseItem = (id: string, raw: unknown, expectedUserId: string): BucketListItem | null =>
  parseBucketListDocument(id, raw, expectedUserId, timestampToIso);

export const bucketListRepository = {
  listByUserId: async (userId: string): Promise<BucketListItem[]> => {
    if (!userId.trim()) {
      return [];
    }
    const snap = await getDocs(collection(doc(firestoreDb, firestoreCollections.users, userId), "bucketList"));
    const out: BucketListItem[] = [];
    for (const d of snap.docs) {
      const row = parseItem(d.id, d.data(), userId);
      if (row) {
        out.push(row);
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  getById: async (userId: string, itemId: string): Promise<BucketListItem | null> => {
    if (!userId.trim() || !itemId.trim()) {
      return null;
    }
    const ref = itemDocRef(userId, itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return null;
    }
    return parseItem(snap.id, snap.data(), userId);
  },

  findByEntityId: async (userId: string, entityId: string): Promise<BucketListItem | null> => {
    if (!userId.trim() || !entityId.trim()) {
      return null;
    }
    const q = query(
      collection(doc(firestoreDb, firestoreCollections.users, userId), "bucketList"),
      where("entityId", "==", entityId.trim()),
    );
    const snap = await getDocs(q);
    const first = snap.docs[0];
    if (!first) {
      return null;
    }
    return parseItem(first.id, first.data(), userId);
  },

  save: async (item: BucketListItem): Promise<void> => {
    if (!item.userId.trim() || !item.id.trim()) {
      throw new TypeError("Bucket list item requires userId and id.");
    }
    await setDoc(itemDocRef(item.userId, item.id), serializeBucketListDocument(item));
  },

  delete: async (userId: string, itemId: string): Promise<void> => {
    if (!userId.trim() || !itemId.trim()) {
      return;
    }
    await deleteDoc(itemDocRef(userId, itemId));
  },
};
