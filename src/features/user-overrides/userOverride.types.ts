export type UserOverrideType =
  | "allow_dense_plan"
  | "ignore_budget_warning"
  | "ignore_low_confidence_data"
  | "force_fast_pace"
  | "keep_closed_place";

/**
 * Explicit user consent for a specific class of plan risk.
 * Stored locally with timestamps — does not mutate travel behavior profiles.
 */
export type UserOverride = {
  id: string;
  userId: string;
  /** When set, the override applies only to this trip; omitted means user-wide (only some types allow this). */
  tripId?: string;
  type: UserOverrideType;
  createdAt: string;
  expiresAt?: string;
  reason?: string;
};

export type RecordUserOverrideInput = {
  userId: string;
  tripId?: string;
  type: UserOverrideType;
  expiresAt?: string;
  reason?: string;
};

/** Types that must be tied to a trip when recorded (rule 4 + rule 5). */
export const TRIP_SCOPED_USER_OVERRIDE_TYPES: ReadonlySet<UserOverrideType> = new Set([
  "allow_dense_plan",
  "ignore_budget_warning",
  "force_fast_pace",
  "keep_closed_place",
]);
