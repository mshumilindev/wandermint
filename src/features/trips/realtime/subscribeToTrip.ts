import { doc, onSnapshot } from "firebase/firestore";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";
import { firestoreCollections } from "../../../shared/config/product";
import { firestoreDb } from "../../../services/firebase/firebaseApp";
import { tripConverter } from "../../../services/firebase/mappers/tripMapper";
import { subscribeToTripExecution } from "./subscribeToTripExecution";
import type {
  FirestoreSnapshotMeta,
  TripRealtimeBundle,
  TripRealtimeConnectionState,
  TripRealtimeListenerOptions,
} from "./tripRealtime.types";

const parseIso = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
};

const maxUpdatedIso = (trip: Trip | null, dayPlans: DayPlan[]): string | null => {
  let best: string | null = null;
  let bestMs = -Infinity;
  if (trip?.updatedAt) {
    const ms = parseIso(trip.updatedAt);
    if (ms >= bestMs) {
      bestMs = ms;
      best = trip.updatedAt;
    }
  }
  for (const day of dayPlans) {
    if (!day.updatedAt) {
      continue;
    }
    const ms = parseIso(day.updatedAt);
    if (ms >= bestMs) {
      bestMs = ms;
      best = day.updatedAt;
    }
  }
  return best;
};

const isOnline = (): boolean => (typeof navigator !== "undefined" ? navigator.onLine : true);

const resolveConnection = (input: {
  firestoreFailed: boolean;
  tripSeen: boolean;
  daysSeen: boolean;
  tripMeta: FirestoreSnapshotMeta | null;
  daysMeta: FirestoreSnapshotMeta | null;
}): TripRealtimeConnectionState => {
  if (input.firestoreFailed) {
    return "error";
  }
  if (!input.tripSeen || !input.daysSeen) {
    return "connecting";
  }
  if (!isOnline()) {
    return "offline_cached";
  }
  if (input.tripMeta?.hasPendingWrites || input.daysMeta?.hasPendingWrites) {
    return "syncing";
  }
  return "live";
};

/**
 * Realtime listener for the trip document (status, dates, segments, etc.).
 */
export function subscribeToTrip(
  tripId: string,
  onNext: (trip: Trip | null, meta: FirestoreSnapshotMeta) => void,
  onError?: (error: Error) => void,
): () => void {
  const trimmed = tripId.trim();
  if (!trimmed) {
    onNext(null, { hasPendingWrites: false, fromCache: false });
    return () => {};
  }

  const ref = doc(firestoreDb, firestoreCollections.trips, trimmed).withConverter(tripConverter);
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snap) => {
      const meta: FirestoreSnapshotMeta = {
        hasPendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      };
      if (!snap.exists()) {
        onNext(null, meta);
        return;
      }
      try {
        onNext(snap.data(), meta);
      } catch {
        onNext(null, meta);
      }
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

/**
 * Single combined subscription: trip doc + day plans + network online/offline.
 * One `onNext` per logical update; call returned function on unmount to detach all listeners.
 */
export function subscribeTripRealtime(tripId: string, options: TripRealtimeListenerOptions): () => void {
  const { onNext, onError } = options;
  const trimmed = tripId.trim();
  if (!trimmed) {
    onNext({
      trip: null,
      dayPlans: [],
      hydrated: false,
      connection: "connecting",
      lastUpdatedIso: null,
      firestoreMeta: { trip: null, days: null },
      online: isOnline(),
    });
    return () => {};
  }

  let cancelled = false;
  let firestoreFailed = false;

  let lastTrip: Trip | null = null;
  let tripMeta: FirestoreSnapshotMeta | null = null;
  let tripSeen = false;

  let lastDays: DayPlan[] = [];
  let daysMeta: FirestoreSnapshotMeta | null = null;
  let daysSeen = false;

  const emit = (): void => {
    if (cancelled) {
      return;
    }
    const online = isOnline();
    const connection = resolveConnection({
      firestoreFailed,
      tripSeen,
      daysSeen,
      tripMeta,
      daysMeta,
    });
    const hydrated = tripSeen && daysSeen;
    const bundle: TripRealtimeBundle = {
      trip: lastTrip,
      dayPlans: lastDays,
      hydrated,
      connection,
      lastUpdatedIso: maxUpdatedIso(lastTrip, lastDays),
      firestoreMeta: { trip: tripMeta, days: daysMeta },
      online,
    };
    onNext(bundle);
  };

  const unsubTrip = subscribeToTrip(
    trimmed,
    (trip, meta) => {
      tripSeen = true;
      lastTrip = trip;
      tripMeta = meta;
      emit();
    },
    (err) => {
      firestoreFailed = true;
      onError?.(err);
      emit();
    },
  );

  const unsubDays = subscribeToTripExecution(
    trimmed,
    (plans, meta) => {
      daysSeen = true;
      lastDays = plans;
      daysMeta = meta;
      emit();
    },
    (err) => {
      firestoreFailed = true;
      onError?.(err);
      emit();
    },
  );

  const onNet = (): void => {
    emit();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
  }

  return () => {
    cancelled = true;
    unsubTrip();
    unsubDays();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    }
  };
}
