import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";

export type TripRealtimeConnectionState =
  | "connecting"
  | "live"
  | "offline_cached"
  | "syncing"
  | "error";

export type FirestoreSnapshotMeta = {
  hasPendingWrites: boolean;
  fromCache: boolean;
};

export type TripRealtimeBundle = {
  trip: Trip | null;
  dayPlans: DayPlan[];
  /** True after at least one snapshot from the trip doc and from the day-plans query. */
  hydrated: boolean;
  connection: TripRealtimeConnectionState;
  /** Latest of trip.updatedAt and each day plan updatedAt (ISO strings). */
  lastUpdatedIso: string | null;
  firestoreMeta: {
    trip: FirestoreSnapshotMeta | null;
    days: FirestoreSnapshotMeta | null;
  };
  online: boolean;
};

export type TripRealtimeListenerOptions = {
  onNext: (bundle: TripRealtimeBundle) => void;
  onError?: (error: Error) => void;
};
