/** Visual / narrative mode for the journey canvas. */
export type TravelerJourneyVisualMode = "timeline" | "constellation";

export type TravelerJourneyNodeType = "trip" | "city" | "country" | "milestone" | "achievement";

export type TravelerJourneyEdgeType = "sequence" | "relation";

export type TravelerJourneyMilestoneKind =
  | "first_trip"
  | "first_international"
  | "first_solo"
  | "longest_trip"
  | "most_completed"
  | "achievement_unlock";

export type TravelerJourneyNode = {
  id: string;
  type: TravelerJourneyNodeType;
  label: string;
  date?: string;
  /** Trip this node belongs to (trips, cities, some milestones). */
  tripId?: string;
  location?: {
    lat: number;
    lng: number;
  };
  /** 0–1 visual emphasis (milestones boosted in layout). */
  importance: number;
  completed: boolean;
  milestoneKind?: TravelerJourneyMilestoneKind;
  /** Optional tooltip / focus subtitle. */
  subtitle?: string;
  /** Bucket tags / loose category for filters. */
  category?: string;
};

export type TravelerJourneyEdge = {
  from: string;
  to: string;
  type: TravelerJourneyEdgeType;
};

export type TravelerJourney = {
  nodes: TravelerJourneyNode[];
  edges: TravelerJourneyEdge[];
  totalTrips: number;
  totalCountries: number;
  totalCities: number;
};

/** Pure input for {@link buildTravelerJourney} — keep free of React. */
export type TravelerJourneyBuildInput = {
  /** User home country name (any casing) for “first international” detection. */
  homeCountry?: string;
  /** Optional completion ratio 0–1 per finished trip id (from analytics scan). */
  tripCompletionByTripId?: Record<string, number>;
};
