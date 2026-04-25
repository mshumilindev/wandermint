import type { Trip } from "../../../entities/trip/model";

/** Documented triggers for major, version-worthy mutations (not minor UI edits). */
export const TRIP_VERSION_REASONS = [
  "initial_generation",
  "ai_replan",
  "live_replan",
  "bulk_edit",
  "post_validation_repair",
] as const;

export type TripVersionReasonTag = (typeof TRIP_VERSION_REASONS)[number];

export type TripVersion = {
  id: string;
  tripId: string;
  createdAt: string;
  /** Human or machine-readable cause; prefer {@link TRIP_VERSION_REASONS} values for analytics. */
  reason: string;
  snapshot: Trip;
};

export type CreateTripVersionInput = {
  trip: Trip;
  reason: string;
};

export type RestoreTripVersionInput = {
  userId: string;
  versionId: string;
};

export type RestoreTripVersionResult = {
  trip: Trip;
  version: TripVersion;
};
