import { doc, getDoc, setDoc } from "firebase/firestore";
import { z } from "zod";
import type { UserProfile } from "../../../entities/user/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../firebaseApp";
import { nowIso, timestampToIso } from "../timestampMapper";

const userProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  avatarUrlHighRes: z.string().nullable(),
  authProvider: z.literal("google"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const normalizeGoogleAvatarUrl = (photoUrl: string | null): string | null => {
  if (!photoUrl) {
    return null;
  }

  if (!photoUrl.includes("googleusercontent.com")) {
    return photoUrl;
  }

  return photoUrl.replace(/=s\d+(-c)?$/, "=s512-c").replace(/=s\d+$/, "=s512-c");
};

export const usersRepository = {
  getUserProfile: async (userId: string): Promise<UserProfile | null> => {
    if (!userId.trim()) {
      return null;
    }

    const snapshot = await getDoc(doc(firestoreDb, firestoreCollections.users, userId));
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return userProfileSchema.parse({
      ...data,
      id: snapshot.id,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
    });
  },

  upsertGoogleProfile: async (profile: Omit<UserProfile, "createdAt" | "updatedAt">): Promise<UserProfile> => {
    if (!profile.id.trim()) {
      throw new Error("User id is required");
    }

    const existing = await usersRepository.getUserProfile(profile.id);
    const now = nowIso();
    const nextProfile: UserProfile = {
      ...profile,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await setDoc(doc(firestoreDb, firestoreCollections.users, profile.id), nextProfile, { merge: true });
    return nextProfile;
  },
};
