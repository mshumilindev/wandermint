import type { FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import type { TravelMemory } from "../../../entities/travel-memory/model";
import { travelMemorySchema } from "../../../entities/travel-memory/schemas";
import { timestampToIso } from "../timestampMapper";

export const travelMemoryConverter: FirestoreDataConverter<TravelMemory> = {
  toFirestore: (memory) => memory,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options);
    return travelMemorySchema.parse({
      ...data,
      id: snapshot.id,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
    });
  },
};
