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
}
