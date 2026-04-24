import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from "firebase/firestore";
import type { ActivityCompletionStatus } from "../../../entities/activity/model";
import type { DayCompletionStatus, DayPlan } from "../../../entities/day-plan/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { dayPlanConverter } from "../mappers/dayPlanMapper";
import { nowIso } from "../timestampMapper";

export const tripDaysRepository = {
  getTripDays: async (tripId: string): Promise<DayPlan[]> => {
    const daysQuery = query(
      collection(firestoreDb, firestoreCollections.tripDays).withConverter(dayPlanConverter),
      where("tripId", "==", tripId),
      orderBy("date", "asc"),
    );
    const snapshot = await getDocs(daysQuery);
    return snapshot.docs.map((dayDoc) => dayDoc.data());
  },

  getTripDayById: async (tripId: string, dayId: string): Promise<DayPlan | null> => {
    const dayRef = doc(firestoreDb, firestoreCollections.tripDays, dayId).withConverter(dayPlanConverter);
    const snapshot = await getDoc(dayRef);
    if (!snapshot.exists()) {
      return null;
    }

    const dayPlan = snapshot.data();
    return dayPlan.tripId === tripId ? dayPlan : null;
  },

  saveTripDays: async (dayPlans: DayPlan[]): Promise<void> => {
    await Promise.all(
      dayPlans.map((dayPlan) =>
        setDoc(doc(firestoreDb, firestoreCollections.tripDays, dayPlan.id).withConverter(dayPlanConverter), dayPlan),
      ),
    );
  },

  updateActivityCompletion: async (
    tripId: string,
    dayId: string,
    blockId: string,
    completionStatus: ActivityCompletionStatus,
  ): Promise<void> => {
    const currentDay = await tripDaysRepository.getTripDayById(tripId, dayId);
    if (!currentDay) {
      throw new Error("Day plan not found");
    }

    const nextBlocks = currentDay.blocks.map((block) =>
      block.id === blockId ? { ...block, completionStatus } : block,
    );

    await updateDoc(doc(firestoreDb, firestoreCollections.tripDays, dayId), {
      blocks: nextBlocks,
      updatedAt: nowIso(),
    });
  },

  updateDayCompletion: async (tripId: string, dayId: string, completionStatus: DayCompletionStatus): Promise<void> => {
    const currentDay = await tripDaysRepository.getTripDayById(tripId, dayId);
    if (!currentDay) {
      throw new Error("Day plan not found");
    }

    await updateDoc(doc(firestoreDb, firestoreCollections.tripDays, dayId), {
      completionStatus,
      updatedAt: nowIso(),
    });
  },

  saveTripDay: async (dayPlan: DayPlan): Promise<void> => {
    await setDoc(doc(firestoreDb, firestoreCollections.tripDays, dayPlan.id).withConverter(dayPlanConverter), dayPlan);
  },

  deleteTripDays: async (tripId: string): Promise<void> => {
    if (!tripId.trim()) {
      return;
    }

    const days = await tripDaysRepository.getTripDays(tripId);
    await Promise.all(days.map((day) => deleteDoc(doc(firestoreDb, firestoreCollections.tripDays, day.id))));
  },
};
