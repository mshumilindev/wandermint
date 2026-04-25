import { collection, getDocs, limit, query } from "firebase/firestore";
import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";
import { debugLogError } from "../../shared/lib/errors";
import { firestoreDb } from "../firebase/firebaseApp";
import { mapFlickSyncLibraryDocument } from "./mapFlickSyncLibraryDocument";

const libraryCollection = (userId: string) => collection(firestoreDb, "profiles", userId, "library");

/**
 * Reads FlickSync library rows from the same Firebase project as WanderMint:
 * `profiles/{uid}/library/{itemId}`.
 */
export const flickSyncLibraryRepository = {
  getUserLibrary: async (userId: string, maxDocs = 200): Promise<FlickSyncLibraryItem[]> => {
    if (!userId.trim()) {
      return [];
    }

    try {
      const snapshot = await getDocs(query(libraryCollection(userId), limit(maxDocs)));
      const items: FlickSyncLibraryItem[] = [];
      snapshot.forEach((docSnap) => {
        const mapped = mapFlickSyncLibraryDocument(docSnap.id, docSnap.data() as Record<string, unknown>);
        if (mapped) {
          items.push(mapped);
        }
      });
      return items;
    } catch (error) {
      debugLogError("flicksync_library_fetch", error);
      return [];
    }
  },
};
