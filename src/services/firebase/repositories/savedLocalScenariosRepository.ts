import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from "firebase/firestore";
import type { LocalScenario } from "../../../entities/local-scenario/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { localScenarioConverter } from "../mappers/localScenarioMapper";

export const savedLocalScenariosRepository = {
  getSavedScenarios: async (userId: string): Promise<LocalScenario[]> => {
    if (!userId.trim()) {
      return [];
    }

    const scenariosQuery = query(
      collection(firestoreDb, firestoreCollections.savedLocalScenarios).withConverter(localScenarioConverter),
      where("userId", "==", userId),
      orderBy("savedAt", "desc"),
      limit(20),
    );
    const snapshot = await getDocs(scenariosQuery);
    return snapshot.docs.map((scenarioDoc) => scenarioDoc.data());
  },

  saveScenario: async (scenario: LocalScenario): Promise<void> => {
    if (!scenario.userId?.trim()) {
      return;
    }

    await setDoc(
      doc(firestoreDb, firestoreCollections.savedLocalScenarios, scenario.id).withConverter(localScenarioConverter),
      scenario,
    );
  },
};
