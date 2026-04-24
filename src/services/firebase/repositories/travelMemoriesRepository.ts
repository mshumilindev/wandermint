import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, where } from "firebase/firestore";
import type { TravelMemory } from "../../../entities/travel-memory/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { travelMemoryConverter } from "../mappers/travelMemoryMapper";

export const travelMemoriesRepository = {
  getUserTravelMemories: async (userId: string): Promise<TravelMemory[]> => {
    if (!userId.trim()) {
      return [];
    }

    const memoriesQuery = query(
      collection(firestoreDb, firestoreCollections.travelMemories).withConverter(travelMemoryConverter),
      where("userId", "==", userId),
      orderBy("startDate", "desc"),
      limit(120),
    );
    const snapshot = await getDocs(memoriesQuery);
    return snapshot.docs.map((memoryDoc) => memoryDoc.data());
  },

  saveTravelMemory: async (memory: TravelMemory): Promise<void> => {
    if (!memory.userId.trim()) {
      return;
    }

    await setDoc(doc(firestoreDb, firestoreCollections.travelMemories, memory.id).withConverter(travelMemoryConverter), memory);
  },

  deleteTravelMemory: async (memoryId: string): Promise<void> => {
    if (!memoryId.trim()) {
      return;
    }

    await deleteDoc(doc(firestoreDb, firestoreCollections.travelMemories, memoryId));
  },
};
