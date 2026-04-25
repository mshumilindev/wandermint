import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClientId } from "../../shared/lib/id";
import { nowIso } from "../../services/firebase/timestampMapper";
import type { PlanWarning } from "../../entities/warning/model";
import type { RecordUserOverrideInput, UserOverride, UserOverrideType } from "./userOverride.types";
import { TRIP_SCOPED_USER_OVERRIDE_TYPES } from "./userOverride.types";
import { hasActiveUserOverride, userOverrideTypesForPlanWarning } from "./userOverridePresentation";

interface UserOverrideState {
  overrides: UserOverride[];
  /** Single explicit consent row (timestamped). Does not change execution profiles. */
  recordOverride: (input: RecordUserOverrideInput) => UserOverride | null;
  revokeOverride: (id: string) => void;
  clearOverridesForTrip: (userId: string, tripId: string) => void;
  /** Records one override per applicable type for this warning (skips types already active). */
  recordOverridesForPlanWarning: (warning: PlanWarning, opts?: { reason?: string; expiresAt?: string }) => UserOverride[];
  hasActiveOverride: (userId: string, type: UserOverrideType, tripId?: string) => boolean;
}

const validateTripScope = (input: RecordUserOverrideInput): boolean => {
  if (TRIP_SCOPED_USER_OVERRIDE_TYPES.has(input.type)) {
    return Boolean(input.tripId?.trim());
  }
  return true;
};

export const useUserOverrideStore = create<UserOverrideState>()(
  persist(
    (set, get) => ({
      overrides: [],

      recordOverride: (input) => {
        if (!validateTripScope(input)) {
          return null;
        }
        const row: UserOverride = {
          id: createClientId("user_override"),
          userId: input.userId,
          tripId: input.tripId,
          type: input.type,
          createdAt: nowIso(),
          expiresAt: input.expiresAt,
          reason: input.reason,
        };
        set((state) => ({ overrides: [...state.overrides, row] }));
        return row;
      },

      revokeOverride: (id) => {
        set((state) => ({ overrides: state.overrides.filter((o) => o.id !== id) }));
      },

      clearOverridesForTrip: (userId, tripId) => {
        set((state) => ({
          overrides: state.overrides.filter((o) => !(o.userId === userId && o.tripId === tripId)),
        }));
      },

      recordOverridesForPlanWarning: (warning, opts) => {
        const types = userOverrideTypesForPlanWarning(warning);
        const created: UserOverride[] = [];
        for (const type of types) {
          if (get().hasActiveOverride(warning.userId, type, warning.tripId)) {
            continue;
          }
          const row = get().recordOverride({
            userId: warning.userId,
            tripId: warning.tripId,
            type,
            reason: opts?.reason,
            expiresAt: opts?.expiresAt,
          });
          if (row) {
            created.push(row);
          }
        }
        return created;
      },

      hasActiveOverride: (userId, type, tripId) => hasActiveUserOverride(get().overrides, userId, type, tripId, Date.now()),
    }),
    {
      name: "wandermint-user-overrides-v1",
      partialize: (state) => ({ overrides: state.overrides }),
    },
  ),
);
