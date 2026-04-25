import { useTripDetailsStore } from "../../app/store/useTripDetailsStore";
import { useTripsStore } from "../../app/store/useTripsStore";
import { drainOfflineSyncQueue, peekOfflineQueue } from "./offlineSyncQueue";
import { getIsOnline, subscribeToNetworkStatus } from "./networkStatus";

const refreshAffectedTrips = async (tripIds: string[]): Promise<void> => {
  for (const tripId of tripIds) {
    const trip = useTripsStore.getState().tripsById[tripId];
    if (trip?.userId) {
      await useTripDetailsStore.getState().refreshTripDetails(trip.userId, tripId);
    }
  }
};

const flushWhenOnline = async (): Promise<void> => {
  if (!getIsOnline()) {
    return;
  }
  if (peekOfflineQueue().length === 0) {
    return;
  }
  const { applied, affectedTripIds } = await drainOfflineSyncQueue();
  if (applied > 0 && affectedTripIds.length > 0) {
    await refreshAffectedTrips(affectedTripIds);
  }
};

/**
 * Returns an unsubscribe for `online` / offline listeners. Safe under React StrictMode when paired with cleanup.
 */
export const registerOfflineSyncListeners = (): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  void flushWhenOnline();

  return subscribeToNetworkStatus((isOnline) => {
    if (isOnline) {
      void flushWhenOnline();
    }
  });
};
