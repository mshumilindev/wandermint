import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyDnYdMrSkdEqVWnU9xojw3TYU7cXvIlvR4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "wandermint-ed491.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "wandermint-ed491",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "wandermint-ed491.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "263561246190",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:263561246190:web:b99afe4b31c2c72ce90aff",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-5S02YJ5F29",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
export const firebaseFunctions = getFunctions(firebaseApp, "us-central1");
export const firebaseProjectId = firebaseConfig.projectId;
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});
