import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from "firebase/firestore";
import type { Trip, TripCompletionStatus } from "../../../entities/trip/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { tripConverter } from "../mappers/tripMapper";
import { nowIso } from "../timestampMapper";

export const tripsRepository = {
  getUserTrips: async (userId: string): Promise<Trip[]> => {
    if (!userId.trim()) {
      return [];
    }

    const tripsQuery = query(
      collection(firestoreDb, firestoreCollections.trips).withConverter(tripConverter),
      where("userId", "==", userId),
      orderBy("dateRange.start", "asc"),
      limit(20),
    );
    const snapshot = await getDocs(tripsQuery);
    return snapshot.docs.map((tripDoc) => tripDoc.data());
  },

  getTripById: async (userId: string, tripId: string): Promise<Trip | null> => {
    if (!userId.trim() || !tripId.trim()) {
      return null;
    }

    const tripRef = doc(firestoreDb, firestoreCollections.trips, tripId).withConverter(tripConverter);
    const snapshot = await getDoc(tripRef);
    if (!snapshot.exists()) {
      return null;
    }

    const trip = snapshot.data();
    return trip.userId === userId ? trip : null;
  },

  saveTrip: async (trip: Trip): Promise<void> => {
    await setDoc(doc(firestoreDb, firestoreCollections.trips, trip.id).withConverter(tripConverter), trip);
  },

  updateTripStatus: async (userId: string, tripId: string, status: TripCompletionStatus): Promise<void> => {
    const existing = await tripsRepository.getTripById(userId, tripId);
    if (!existing) {
      throw new Error("Trip not found");
    }

    await updateDoc(doc(firestoreDb, firestoreCollections.trips, tripId), {
      status,
      updatedAt: nowIso(),
    });
  },

  deleteTrip: async (userId: string, tripId: string): Promise<void> => {
    const existing = await tripsRepository.getTripById(userId, tripId);
    if (!existing) {
      throw new Error("Trip not found");
    }

    await deleteDoc(doc(firestoreDb, firestoreCollections.trips, tripId));
  },
};
