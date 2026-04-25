export type TripPlanPriority = "must" | "high" | "medium" | "low";

export type TripPlanItemStatus = "planned" | "completed" | "skipped";

export type TripPlanItemType = string;

/** Geographic anchor for distance / routing hints (optional fields beyond coordinates). */
export type TripPlanLocation = {
  lat: number;
  lng: number;
  /** When set with `weatherRisk: 'high'`, removal prefers outdoor stops first. */
  indoorOutdoor?: "indoor" | "outdoor" | "mixed";
};

export type TripPlanItem = {
  id: string;
  title: string;
  type: TripPlanItemType;
  priority: TripPlanPriority;
  location: TripPlanLocation;
  plannedStartTime: string;
  plannedEndTime: string;
  estimatedDurationMinutes: number;
  /** Travel from the previous itinerary stop to this one (0 for first item of the day). */
  travelTimeFromPreviousMinutes: number;
  status: TripPlanItemStatus;
  /** Provider place id from the underlying place snapshot when known (ranking / hints). */
  providerPlaceId?: string;
  /** Originating bucket list row id when the stop came from the user’s bucket list. */
  bucketListItemId?: string;
  imageUrl?: string;
  locationResolutionStatus?: "resolved" | "missing" | "estimated";
  /** Compact provider opening-hours label; used for deterministic live replanning checks. */
  openingHoursLabel?: string;
  /** IANA timezone for interpreting {@link openingHoursLabel} wall times (e.g. segment plan TZ). */
  openingHoursTimezone?: string;
  /** When low, live UI may label travel time as approximate (see movement legs). */
  travelEstimateConfidence?: "high" | "medium" | "low";
};

export type TripExecutionUserMode = "fast" | "balanced" | "slow";

export type TripExecutionEnergyLevel = "high" | "medium" | "low";

export type TripExecutionWeatherRisk = "none" | "low" | "medium" | "high";

export type TripExecutionState = {
  /** ISO 8601 instant used as “now” for the decision. */
  now: string;
  userLocation?: {
    lat: number;
    lng: number;
  };
  /** Local wall-clock start of the planning window, `HH:mm` on the same calendar day as `now`. */
  dayStartTime: string;
  /** Local wall-clock end of the planning window, `HH:mm` on the same calendar day as `now`. */
  dayEndTime: string;
  items: TripPlanItem[];
  completedItemIds: string[];
  skippedItemIds: string[];
  userMode: TripExecutionUserMode;
  energyLevel?: TripExecutionEnergyLevel;
  weatherRisk?: TripExecutionWeatherRisk;
};

export type DecisionStatus = "on_track" | "delayed" | "overloaded" | "needs_replan";

export type DecisionRecommendedAction =
  | "continue"
  | "skip_next_low_priority"
  | "shorten_current_item"
  | "reorder_remaining"
  | "end_day";

export type DecisionResult = {
  status: DecisionStatus;
  recommendedAction: DecisionRecommendedAction;
  nextItem?: TripPlanItem;
  removedItems: TripPlanItem[];
  reorderedItems: TripPlanItem[];
  explanation: string;
};
