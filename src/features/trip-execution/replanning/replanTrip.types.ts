import type { TripExecutionState, TripPlanItem } from "../decisionEngine.types";

export type ReplanReason =
  | "user_skipped_item"
  | "user_is_late"
  | "weather_changed"
  | "user_energy_low"
  | "place_closed";

export type ReplanInput = {
  executionState: TripExecutionState;
  reason: ReplanReason;
  /**
   * For `place_closed`: which planned item is unavailable.
   * If omitted, the first remaining planned item whose window contains `now` is used when possible.
   */
  affectedItemId?: string;
};

export type ReplanConfidence = "high" | "medium" | "low";

export type ReplanResult = {
  updatedItems: TripPlanItem[];
  removedItems: TripPlanItem[];
  movedItems: TripPlanItem[];
  messageToUser: string;
  confidence: ReplanConfidence;
};

/** Optional AI hook after deterministic pruning (e.g. qualitative place_closed swap). */
export type ReplanTripOptions = {
  /**
   * Same-window replacements considered before {@link suggestReplacement}.
   * First item that is deterministically `open`, else first `unknown` hours, is used.
   */
  replacementCandidates?: TripPlanItem[];
  suggestReplacement?: (closedItem: TripPlanItem, input: ReplanInput) => Promise<TripPlanItem | null>;
};
