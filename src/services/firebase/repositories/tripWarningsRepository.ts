import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, where } from "firebase/firestore";
import type { PlanWarning } from "../../../entities/warning/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { warningConverter } from "../mappers/warningMapper";

export const tripWarningsRepository = {
  getTripWarnings: async (tripId: string): Promise<PlanWarning[]> => {
    const warningsQuery = query(
      collection(firestoreDb, firestoreCollections.tripWarnings).withConverter(warningConverter),
      where("tripId", "==", tripId),
      orderBy("createdAt", "desc"),
      limit(12),
    );
    const snapshot = await getDocs(warningsQuery);
    return snapshot.docs.map((warningDoc) => warningDoc.data());
  },

  saveTripWarnings: async (warnings: PlanWarning[]): Promise<void> => {
    await Promise.all(
      warnings.map((warning) =>
        setDoc(doc(firestoreDb, firestoreCollections.tripWarnings, warning.id).withConverter(warningConverter), warning),
      ),
    );
  },

  deleteTripWarnings: async (tripId: string): Promise<void> => {
    if (!tripId.trim()) {
      return;
    }

    const warnings = await tripWarningsRepository.getTripWarnings(tripId);
    await Promise.all(warnings.map((warning) => deleteDoc(doc(firestoreDb, firestoreCollections.tripWarnings, warning.id))));
  },
};
