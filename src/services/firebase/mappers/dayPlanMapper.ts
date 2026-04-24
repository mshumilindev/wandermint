import type { DocumentData, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import type { DayPlan } from "../../../entities/day-plan/model";
import { dayPlanSchema } from "../../../entities/day-plan/schemas";
import { timestampToIso } from "../timestampMapper";

export const dayPlanFromFirestore = (id: string, data: DocumentData): DayPlan => {
  const normalized = {
    ...data,
    id,
    updatedAt: timestampToIso(data.updatedAt),
  };

  return dayPlanSchema.parse(normalized);
};

export const dayPlanToFirestore = (dayPlan: DayPlan): DocumentData => ({
  ...dayPlan,
});

export const dayPlanConverter = {
  toFirestore: dayPlanToFirestore,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): DayPlan =>
    dayPlanFromFirestore(snapshot.id, snapshot.data(options)),
};
