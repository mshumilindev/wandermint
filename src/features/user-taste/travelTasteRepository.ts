import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { normalizeItineraryCategory } from "../../services/planning/itineraryCompositionService";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { placeExperienceMemoriesRepository } from "../../services/firebase/repositories/placeExperienceMemoriesRepository";
import { tripDaysRepository } from "../../services/firebase/repositories/tripDaysRepository";
import { tripsRepository } from "../../services/firebase/repositories/tripsRepository";
import {
  accumulateDayPlanSignals,
  accumulatePlaceMemorySignals,
  computeTravelTasteProfile,
  emptyTasteRawSignals,
} from "./travelTasteCalculator";
import { travelTasteProfileSchema, type TravelTasteProfile } from "./travelTaste.types";

const tasteDocRef = (userId: string) => doc(firestoreDb, "users", userId, "personalTravelTaste", "profile");

export const travelTasteRepository = {
  getProfile: async (userId: string): Promise<TravelTasteProfile | null> => {
    if (!userId.trim()) {
      return null;
    }
    const snapshot = await getDoc(tasteDocRef(userId));
    if (!snapshot.exists()) {
      return null;
    }
    return travelTasteProfileSchema.parse(snapshot.data());
  },

  saveProfile: async (profile: TravelTasteProfile): Promise<void> => {
    if (!profile.userId.trim()) {
      return;
    }
    await setDoc(tasteDocRef(profile.userId), profile, { merge: true });
  },

  deleteProfile: async (userId: string): Promise<void> => {
    if (!userId.trim()) {
      return;
    }
    const ref = tasteDocRef(userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
    }
  },

  /**
   * Recomputes taste from place memories + recent trip day plans (capped per trip in calculator).
   * Call only when the user has opted into usage-based learning.
   */
  refreshProfileFromUserSources: async (userId: string): Promise<TravelTasteProfile | null> => {
    if (!userId.trim()) {
      return null;
    }
    const raw = emptyTasteRawSignals();
    const memories = await placeExperienceMemoriesRepository.getUserPlaceMemories(userId).catch(() => []);
    accumulatePlaceMemorySignals(memories, raw);

    const trips = await tripsRepository.getUserTrips(userId).catch(() => []);
    for (const trip of trips) {
      const days = await tripDaysRepository.getTripDays(trip.id).catch(() => []);
      accumulateDayPlanSignals(days, trip.id, normalizeItineraryCategory, raw);
    }

    const profile = computeTravelTasteProfile(userId, raw);
    if (raw.totalScoringEvents < 2) {
      await travelTasteRepository.deleteProfile(userId);
      return null;
    }
    await travelTasteRepository.saveProfile(profile);
    return profile;
  },
};
