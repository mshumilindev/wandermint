export type ReservationRequirementLevel =
  | "none"
  | "recommended"
  | "required"
  | "time_slot_required"
  | "unknown";

export type ReservationConfidence = "high" | "medium" | "low";

/**
 * Ticket / timed-entry awareness for a single itinerary block.
 * `bookingUrl` is only set when supplied by verified app data — never invented in heuristics.
 */
export type ReservationRequirement = {
  itemId: string;
  requirement: ReservationRequirementLevel;
  source: string;
  confidence: ReservationConfidence;
  bookingUrl?: string;
};
