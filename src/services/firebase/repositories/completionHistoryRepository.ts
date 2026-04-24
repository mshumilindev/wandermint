import { doc, setDoc } from "firebase/firestore";
import type { CompletionHistoryItem } from "../../../entities/completion/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";

export const completionHistoryRepository = {
  recordCompletionChange: async (item: CompletionHistoryItem): Promise<void> => {
    await setDoc(doc(firestoreDb, firestoreCollections.completionHistory, item.id), item);
  },
};
