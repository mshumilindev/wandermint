export type ActivityBlockType = "activity" | "meal" | "transfer" | "rest";
export type IndoorOutdoor = "indoor" | "outdoor" | "mixed";
export type ActivityPriority = "must" | "should" | "optional";
export type ActivityCompletionStatus =
  | "pending"
  | "in_progress"
  | "unconfirmed"
  | "done"
  | "skipped"
  | "missed"
  | "cancelled_by_replan";

export type PlacePlanningSource = "bucket_list";

export interface PlaceSnapshot {
  provider: string;
  providerPlaceId?: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  openingHoursLabel?: string;
  priceLevel?: number;
  rating?: number;
  capturedAt: string;
  /** When set, UI shows a bucket-list origin badge (trip planning integration). */
  planningSource?: PlacePlanningSource;
  /** Stable id of the originating bucket-list row when `planningSource` is `bucket_list`. */
  bucketListItemId?: string;
}

export interface CostRange {
  min: number;
  max: number;
  currency: string;
  certainty: "exact" | "estimated" | "unknown";
}

export interface ActivityDependencies {
  weatherSensitive: boolean;
  bookingRequired: boolean;
  openingHoursSensitive: boolean;
  priceSensitive: boolean;
}

export interface ActivityAlternative {
  id: string;
  title: string;
  reason: string;
  estimatedCost?: CostRange;
  place?: PlaceSnapshot;
}

export type MovementMode = "walking" | "public_transport" | "taxi";

export interface MovementOption {
  mode: MovementMode;
  durationMinutes: number;
  estimatedCost?: CostRange;
  certainty: "live" | "partial";
  sourceName: string;
  /** When set, UI may soften copy for low-confidence legs (e.g. haversine fallback). */
  estimateConfidence?: "high" | "medium" | "low";
}

export interface MovementLeg {
  id: string;
  fromBlockId: string;
  toBlockId: string;
  summary: string;
  distanceMeters?: number;
  primary: MovementOption;
  alternatives: MovementOption[];
}

/** Persisted v2 projection aligned with trip-execution `TripPlanItem` (safe defaults for legacy blocks). */
export type NormalizedTripPlanEnginePriority = "must" | "high" | "medium" | "low";
export type NormalizedTripPlanEngineStatus = "planned" | "completed" | "skipped";
export type NormalizedTripPlanLocationResolutionStatus = "resolved" | "missing" | "estimated";

export interface NormalizedTripPlanItemFields {
  priority: NormalizedTripPlanEnginePriority;
  status: NormalizedTripPlanEngineStatus;
  estimatedDurationMinutes: number;
  /** First item of the day uses `0`; later items use `null` until travel is estimated from legs. */
  travelTimeFromPreviousMinutes: number | null;
  imageUrl?: string;
  locationResolutionStatus: NormalizedTripPlanLocationResolutionStatus;
  openingHoursLabel?: string;
  openingHoursTimezone?: string;
}

export interface ActivityBlock {
  id: string;
  type: ActivityBlockType;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  place?: PlaceSnapshot;
  category: string;
  tags: string[];
  indoorOutdoor: IndoorOutdoor;
  estimatedCost: CostRange;
  dependencies: ActivityDependencies;
  alternatives: ActivityAlternative[];
  sourceSnapshots: PlaceSnapshot[];
  priority: ActivityPriority;
  locked: boolean;
  completionStatus: ActivityCompletionStatus;
  normalizedTripPlanItem?: NormalizedTripPlanItemFields;
  /** User explicitly acknowledged conservative safety hints for this step. */
  safetyWarningAcknowledged?: boolean;
}
