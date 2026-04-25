import { z } from "zod";
import { nowIso } from "../../services/firebase/timestampMapper";

/**
 * User-controlled privacy flags. Persisted separately from travel preferences.
 * Behavior learning aggregates completion patterns only — never raw GPS traces (see travel behavior calculator).
 */
export type PrivacySettings = {
  userId: string;
  allowLocationDuringTrip: boolean;
  allowBehaviorLearning: boolean;
  allowPostTripAnalysis: boolean;
  allowExternalEventSearch: boolean;
  updatedAt: string;
};

export const privacySettingsSchema = z.object({
  userId: z.string(),
  allowLocationDuringTrip: z.boolean(),
  allowBehaviorLearning: z.boolean(),
  allowPostTripAnalysis: z.boolean(),
  allowExternalEventSearch: z.boolean(),
  updatedAt: z.string(),
});

export const createDefaultPrivacySettings = (userId: string): PrivacySettings => ({
  userId,
  /** Consent-first defaults — features stay off until the user opts in on the privacy screen or an inline prompt. */
  allowLocationDuringTrip: false,
  allowBehaviorLearning: false,
  allowPostTripAnalysis: false,
  allowExternalEventSearch: false,
  updatedAt: nowIso(),
});
