import { create } from "zustand";
import { createClientId } from "../../../shared/lib/id";
import { nowIso } from "../../../services/firebase/timestampMapper";
import type { ActivityOverlayEntry, InsertedPlanStub, TripPlanOverlay } from "../visited/planOverlayModel";
import { emptyTripPlanOverlay } from "../visited/planOverlayModel";

const STORAGE_KEY = "wm_trip_plan_overlay_v2";

interface PlanOverlayState {
  overlays: Record<string, TripPlanOverlay>;
  hydrate: () => void;
  persist: () => void;
  getOverlay: (tripId: string) => TripPlanOverlay;
  setActivityPatch: (tripId: string, activityKey: string, patch: Partial<ActivityOverlayEntry>) => void;
  dismissFingerprint: (tripId: string, fingerprint: string) => void;
  recordCooldown: (tripId: string, cooldownKey: string, now: Date) => void;
  appendInsertedStub: (tripId: string, stub: Omit<InsertedPlanStub, "id" | "createdAt">) => void;
}

const persistOverlays = (overlays: Record<string, TripPlanOverlay>): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overlays));
  } catch {
    /* quota / private mode */
  }
};

export const usePlanOverlayStore = create<PlanOverlayState>((set, get) => ({
  overlays: {},

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, TripPlanOverlay>;
      if (parsed && typeof parsed === "object") {
        set({ overlays: parsed });
      }
    } catch {
      /* ignore */
    }
  },

  persist: () => {
    persistOverlays(get().overlays);
  },

  getOverlay: (tripId) => get().overlays[tripId] ?? emptyTripPlanOverlay(),

  setActivityPatch: (tripId, activityKey, patch) => {
    set((state) => {
      const prev = state.overlays[tripId] ?? emptyTripPlanOverlay();
      const nextEntry: ActivityOverlayEntry = { ...prev.activities[activityKey], ...patch };
      const next: TripPlanOverlay = {
        ...prev,
        activities: { ...prev.activities, [activityKey]: nextEntry },
      };
      const overlays = { ...state.overlays, [tripId]: next };
      persistOverlays(overlays);
      return { overlays };
    });
  },

  dismissFingerprint: (tripId, fingerprint) => {
    set((state) => {
      const prev = state.overlays[tripId] ?? emptyTripPlanOverlay();
      const next: TripPlanOverlay = {
        ...prev,
        dismissed: { ...prev.dismissed, [fingerprint]: nowIso() },
      };
      const overlays = { ...state.overlays, [tripId]: next };
      persistOverlays(overlays);
      return { overlays };
    });
  },

  recordCooldown: (tripId, cooldownKey, now) => {
    set((state) => {
      const prev = state.overlays[tripId] ?? emptyTripPlanOverlay();
      const next: TripPlanOverlay = {
        ...prev,
        cooldownUntil: { ...prev.cooldownUntil, [cooldownKey]: now.getTime() + 30 * 60 * 1000 },
      };
      const overlays = { ...state.overlays, [tripId]: next };
      persistOverlays(overlays);
      return { overlays };
    });
  },

  appendInsertedStub: (tripId, stub) => {
    set((state) => {
      const prev = state.overlays[tripId] ?? emptyTripPlanOverlay();
      const row: InsertedPlanStub = {
        ...stub,
        id: createClientId("insert"),
        createdAt: nowIso(),
      };
      const next: TripPlanOverlay = {
        ...prev,
        inserted: [...prev.inserted, row],
      };
      const overlays = { ...state.overlays, [tripId]: next };
      persistOverlays(overlays);
      return { overlays };
    });
  },
}));

void usePlanOverlayStore.getState().hydrate();
