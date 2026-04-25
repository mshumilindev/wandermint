import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import type { DayPlan } from "../../../entities/day-plan/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../../../services/firebase/firebaseApp";
import { dayPlanConverter } from "../../../services/firebase/mappers/dayPlanMapper";
import type { FirestoreSnapshotMeta } from "./tripRealtime.types";

/**
 * Realtime listener for trip day documents (plan + per-block completion / item status).
 */
export function subscribeToTripExecution(
  tripId: string,
  onNext: (dayPlans: DayPlan[], meta: FirestoreSnapshotMeta) => void,
  onError?: (error: Error) => void,
): () => void {
  const trimmed = tripId.trim();
  if (!trimmed) {
    onNext([], { hasPendingWrites: false, fromCache: false });
    return () => {};
  }

  const q = query(
    collection(firestoreDb, firestoreCollections.tripDays).withConverter(dayPlanConverter),
    where("tripId", "==", trimmed),
    orderBy("date", "asc"),
  );

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const meta: FirestoreSnapshotMeta = {
        hasPendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      };
      onNext(
        snap.docs.map((d) => d.data()),
        meta,
      );
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}
