import { create } from "zustand";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import { tripDaysRepository } from "../../services/firebase/repositories/tripDaysRepository";
import { tripsRepository } from "../../services/firebase/repositories/tripsRepository";
import { cacheDurations, createIdleCacheMeta, isCacheFresh, type CacheMeta } from "../../shared/types/cache";
import { getErrorMessage } from "../../shared/lib/errors";

interface TripsState {
  tripsById: Record<string, Trip>;
  tripIds: string[];
  listMeta: CacheMeta;
  selectedTripId: string | null;
  ensureTrips: (userId: string) => Promise<void>;
  refreshTrips: (userId: string) => Promise<void>;
  saveGeneratedTrip: (trip: Trip, days: DayPlan[]) => Promise<void>;
  saveTrip: (trip: Trip) => Promise<void>;
  patchTrip: (trip: Trip) => void;
  deleteTrip: (userId: string, tripId: string) => Promise<void>;
  removeTripFromCache: (tripId: string) => void;
}

export const useTripsStore = create<TripsState>((set, get) => ({
  tripsById: {},
  tripIds: [],
  listMeta: createIdleCacheMeta(),
  selectedTripId: null,

  ensureTrips: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    if (isCacheFresh(get().listMeta, cacheDurations.medium)) {
      return;
    }
    await get().refreshTrips(userId);
  },

  refreshTrips: async (userId) => {
    if (!userId.trim()) {
      return;
    }
    set((state) => ({ listMeta: { ...state.listMeta, status: "loading", error: null } }));
    try {
      const trips = await tripsRepository.getUserTrips(userId);
      set({
        tripsById: Object.fromEntries(trips.map((trip) => [trip.id, trip])),
        tripIds: trips.map((trip) => trip.id),
        listMeta: { status: "success", lastFetchedAt: Date.now(), lastValidatedAt: null, isDirty: false, error: null },
      });
    } catch (error) {
      set((state) => ({ listMeta: { ...state.listMeta, status: "error", error: getErrorMessage(error) } }));
    }
  },

  saveGeneratedTrip: async (trip, days) => {
    await tripsRepository.saveTrip(trip);
    await tripDaysRepository.saveTripDays(days);
    set((state) => ({
      tripsById: { ...state.tripsById, [trip.id]: trip },
      tripIds: state.tripIds.includes(trip.id) ? state.tripIds : [trip.id, ...state.tripIds],
      selectedTripId: trip.id,
      listMeta: { ...state.listMeta, status: "success", isDirty: false, lastFetchedAt: state.listMeta.lastFetchedAt ?? Date.now() },
    }));
  },

  saveTrip: async (trip) => {
    await tripsRepository.saveTrip(trip);
    set((state) => ({
      tripsById: { ...state.tripsById, [trip.id]: trip },
      tripIds: state.tripIds.includes(trip.id) ? state.tripIds : [trip.id, ...state.tripIds],
      selectedTripId: trip.id,
      listMeta: { ...state.listMeta, status: "success", isDirty: false, lastFetchedAt: state.listMeta.lastFetchedAt ?? Date.now() },
    }));
  },

  patchTrip: (trip) => {
    set((state) => ({
      tripsById: { ...state.tripsById, [trip.id]: trip },
      tripIds: state.tripIds.includes(trip.id) ? state.tripIds : [trip.id, ...state.tripIds],
    }));
  },

  deleteTrip: async (userId, tripId) => {
    if (!userId.trim() || !tripId.trim()) {
      return;
    }

    await tripsRepository.deleteTrip(userId, tripId);
    get().removeTripFromCache(tripId);
  },

  removeTripFromCache: (tripId) => {
    set((state) => {
      const nextTrips = { ...state.tripsById };
      delete nextTrips[tripId];

      return {
        tripsById: nextTrips,
        tripIds: state.tripIds.filter((id) => id !== tripId),
        selectedTripId: state.selectedTripId === tripId ? null : state.selectedTripId,
        listMeta: { ...state.listMeta, status: "success", isDirty: false, lastFetchedAt: state.listMeta.lastFetchedAt ?? Date.now() },
      };
    });
  },
}));
