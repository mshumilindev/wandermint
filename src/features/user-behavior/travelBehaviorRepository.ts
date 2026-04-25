import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { firestoreDb } from "../../services/firebase/firebaseApp";
import { travelBehaviorProfileSchema, type TravelBehaviorProfile } from "./travelBehavior.types";

const profileDocRef = (userId: string) => doc(firestoreDb, "users", userId, "travelBehavior", "profile");

export const travelBehaviorRepository = {
  getProfile: async (userId: string): Promise<TravelBehaviorProfile | null> => {
    if (!userId.trim()) {
      return null;
    }

    const snapshot = await getDoc(profileDocRef(userId));
    if (!snapshot.exists()) {
      return null;
    }

    return travelBehaviorProfileSchema.parse(snapshot.data());
  },

  saveProfile: async (profile: TravelBehaviorProfile): Promise<void> => {
    if (!profile.userId.trim()) {
      return;
    }

    await setDoc(profileDocRef(profile.userId), profile, { merge: true });
  },

  deleteProfile: async (userId: string): Promise<void> => {
    if (!userId.trim()) {
      return;
    }
    const ref = profileDocRef(userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
    }
  },
};
