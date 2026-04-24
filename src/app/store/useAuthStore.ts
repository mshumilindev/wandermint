import { onAuthStateChanged, signInWithPopup, signOut, type Unsubscribe } from "firebase/auth";
import { create } from "zustand";
import type { AuthUser } from "../../entities/user/model";
import { firebaseAuth, googleProvider } from "../../services/firebase/firebaseApp";
import { normalizeGoogleAvatarUrl, usersRepository } from "../../services/firebase/repositories/usersRepository";

interface AuthState {
  user: AuthUser | null;
  status: "initializing" | "authenticated" | "anonymous";
  error: string | null;
  startAuthListener: () => Unsubscribe;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const mapFirebaseUser = async (user: NonNullable<typeof firebaseAuth.currentUser>): Promise<AuthUser> => {
  const avatarUrlHighRes = normalizeGoogleAvatarUrl(user.photoURL);
  return {
    id: user.uid,
    displayName: user.displayName ?? "Traveler",
    email: user.email ?? "",
    avatarUrl: user.photoURL,
    avatarUrlHighRes,
  };
};

const persistFirebaseUserProfile = async (user: NonNullable<typeof firebaseAuth.currentUser>): Promise<AuthUser> => {
  const avatarUrlHighRes = normalizeGoogleAvatarUrl(user.photoURL);
  const profile = await usersRepository.upsertGoogleProfile({
    id: user.uid,
    displayName: user.displayName ?? "Traveler",
    email: user.email ?? "",
    avatarUrl: user.photoURL,
    avatarUrlHighRes,
    authProvider: "google",
  });

  return {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    avatarUrl: profile.avatarUrl,
    avatarUrlHighRes: profile.avatarUrlHighRes,
  };
};

let authListenerUnsubscribe: Unsubscribe | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "initializing",
  error: null,

  startAuthListener: () => {
    if (authListenerUnsubscribe) {
      return authListenerUnsubscribe;
    }

    authListenerUnsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (firebaseUser) {
        void (async () => {
          const mappedUser = await mapFirebaseUser(firebaseUser);
          set({ user: mappedUser, status: "authenticated", error: null });

          try {
            await firebaseUser.getIdToken();
            const persistedUser = await persistFirebaseUserProfile(firebaseUser);
            set({ user: persistedUser, status: "authenticated", error: null });
          } catch {
            set((state) => ({ user: state.user ?? mappedUser, status: "authenticated", error: null }));
          }
        })();
        return;
      }

      set({ user: null, status: "anonymous", error: null });
    });

    return () => {
      authListenerUnsubscribe?.();
      authListenerUnsubscribe = null;
    };
  },

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch {
      set({ error: "Google sign-in could not be completed. Please try again." });
    }
  },

  signOutUser: async () => {
    await signOut(firebaseAuth);
    set({ user: null, status: "anonymous", error: null });
  },
}));
