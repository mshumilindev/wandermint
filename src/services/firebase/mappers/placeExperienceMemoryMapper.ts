import type { FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import type { PlaceExperienceMemory } from "../../../entities/place-memory/model";
import { placeExperienceMemorySchema } from "../../../entities/place-memory/schemas";
import { timestampToIso } from "../timestampMapper";

export const placeExperienceMemoryConverter: FirestoreDataConverter<PlaceExperienceMemory> = {
  toFirestore: (memory) => memory,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options);
    return placeExperienceMemorySchema.parse({
      ...data,
      id: snapshot.id,
      lastVisitedAt: data.lastVisitedAt === null || data.lastVisitedAt === undefined ? null : timestampToIso(data.lastVisitedAt),
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
    });
  },
};
