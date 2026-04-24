import type { DocumentData, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import type { Trip, TripSummary } from "../../../entities/trip/model";
import { tripSchema } from "../../../entities/trip/schemas";
import { timestampToIso } from "../timestampMapper";

export const tripFromFirestore = (id: string, data: DocumentData): Trip => {
  const normalized = {
    ...data,
    id,
    tripSegments: data.tripSegments ?? data.citySegments ?? [],
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    lastValidatedAt: data.lastValidatedAt === null || data.lastValidatedAt === undefined ? null : timestampToIso(data.lastValidatedAt),
  };

  return tripSchema.parse(normalized);
};

export const tripToFirestore = (trip: Trip): DocumentData => {
  const { tripSegments, ...rest } = trip;
  return {
    ...rest,
    tripSegments,
  };
};

export const tripSummaryFromTrip = (trip: Trip, warningCount: number): TripSummary => ({
  id: trip.id,
  userId: trip.userId,
  title: trip.title,
  destination: trip.destination,
  dateRange: trip.dateRange,
  status: trip.status,
  warningCount,
  nextActionLabel: warningCount > 0 ? "Review trip health" : "Open command view",
  updatedAt: trip.updatedAt,
});

export const tripConverter = {
  toFirestore: tripToFirestore,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Trip =>
    tripFromFirestore(snapshot.id, snapshot.data(options)),
};
