import type { DocumentData, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import type { LocalScenario } from "../../../entities/local-scenario/model";
import { localScenarioSchema } from "../../../entities/local-scenario/schemas";
import { timestampToIso } from "../timestampMapper";

export const localScenarioFromFirestore = (id: string, data: DocumentData): LocalScenario => {
  const normalized = {
    ...data,
    id,
    createdAt: timestampToIso(data.createdAt),
    savedAt: data.savedAt === undefined ? undefined : timestampToIso(data.savedAt),
  };

  return localScenarioSchema.parse(normalized);
};

export const localScenarioToFirestore = (scenario: LocalScenario): DocumentData => ({
  ...scenario,
});

export const localScenarioConverter = {
  toFirestore: localScenarioToFirestore,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): LocalScenario =>
    localScenarioFromFirestore(snapshot.id, snapshot.data(options)),
};
