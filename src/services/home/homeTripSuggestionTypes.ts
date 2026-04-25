/**
 * Homepage trip suggestion engine — kinds are assigned by deterministic scoring;
 * copy is refined locally (optional remote AI later) without inventing destinations.
 */
export type HomeTripSuggestionKind =
  | "return_trip"
  | "similar_trip"
  | "new_exploration"
  | "bucket_list_push"
  | "seasonal_opportunity"
  | "event_driven"
  | "vibe_based";

export type SuggestedTripDestination = {
  city?: string;
  country: string;
};

export type SuggestedTripBudgetEstimate = {
  min: number;
  max: number;
  currency: string;
};

export type SuggestedTrip = {
  id: string;
  title: string;
  destination: SuggestedTripDestination;
  durationDays: number;
  estimatedBudget: SuggestedTripBudgetEstimate;
  reasoning: string;
  confidence: number;
  sourceSignals: string[];
  type: HomeTripSuggestionKind;
};

/** Internal candidate before AI refinement — same destination/budget/duration constraints. */
export type HomeTripSuggestionCandidate = SuggestedTrip & {
  /** Raw deterministic score before normalization (0–1 range in scoring output). */
  score: number;
};

export type HomeSuggestionBadgeKey =
  | "travel_style"
  | "bucket_list"
  | "music_inspired"
  | "return_favorite"
  | "curated";

export const suggestionKindToBadgeKey = (kind: HomeTripSuggestionKind): HomeSuggestionBadgeKey => {
  switch (kind) {
    case "return_trip":
      return "return_favorite";
    case "bucket_list_push":
      return "bucket_list";
    case "event_driven":
    case "vibe_based":
      return "music_inspired";
    case "similar_trip":
    case "new_exploration":
    case "seasonal_opportunity":
      return "travel_style";
  }
};
