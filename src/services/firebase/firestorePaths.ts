import { doc } from "firebase/firestore";
import { firestoreCollections } from "../../shared/config/product";
import { firestoreDb } from "./firebaseApp";

export const firestoreDoc = (collectionName: keyof typeof firestoreCollections, id: string) =>
  doc(firestoreDb, firestoreCollections[collectionName], id);
