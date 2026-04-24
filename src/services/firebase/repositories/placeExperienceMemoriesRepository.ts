import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from "firebase/firestore";
import type { PlaceExperienceMemory } from "../../../entities/place-memory/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { placeExperienceMemoryConverter } from "../mappers/placeExperienceMemoryMapper";

export const placeExperienceMemoriesRepository = {
  getUserPlaceMemories: async (userId: string): Promise<PlaceExperienceMemory[]> => {
    if (!userId.trim()) {
      return [];
    }

    const memoriesQuery = query(
      collection(firestoreDb, firestoreCollections.placeExperienceMemories).withConverter(placeExperienceMemoryConverter),
      where("userId", "==", userId),
      limit(600),
    );
    const snapshot = await getDocs(memoriesQuery);
    return snapshot.docs.map((memoryDoc) => memoryDoc.data());
  },

  getPlaceMemoryById: async (memoryId: string): Promise<PlaceExperienceMemory | null> => {
    if (!memoryId.trim()) {
      return null;
    }

    const memoryRef = doc(firestoreDb, firestoreCollections.placeExperienceMemories, memoryId).withConverter(placeExperienceMemoryConverter);
    const snapshot = await getDoc(memoryRef);
    return snapshot.exists() ? snapshot.data() : null;
  },

  savePlaceMemory: async (memory: PlaceExperienceMemory): Promise<void> => {
    await setDoc(doc(firestoreDb, firestoreCollections.placeExperienceMemories, memory.id).withConverter(placeExperienceMemoryConverter), memory);
  },
};
