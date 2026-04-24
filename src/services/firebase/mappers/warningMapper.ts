import type { DocumentData, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import type { PlanWarning } from "../../../entities/warning/model";
import { planWarningSchema } from "../../../entities/day-plan/schemas";
import { timestampToIso } from "../timestampMapper";

export const warningFromFirestore = (id: string, data: DocumentData): PlanWarning => {
  const normalized = {
    ...data,
    id,
    createdAt: timestampToIso(data.createdAt),
    acknowledgedAt: data.acknowledgedAt === undefined ? undefined : timestampToIso(data.acknowledgedAt),
  };

  return planWarningSchema.parse(normalized);
};

export const warningToFirestore = (warning: PlanWarning): DocumentData => ({
  ...warning,
});

export const warningConverter = {
  toFirestore: warningToFirestore,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): PlanWarning =>
    warningFromFirestore(snapshot.id, snapshot.data(options)),
};
