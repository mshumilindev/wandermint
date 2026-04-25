import type { FestivalSelection } from "../events/eventLookup.model";
import type { FoodDrinkPlannerSettings } from "../food-culture/model";

export type TripCompletionStatus =
  | "draft"
  | "active"
  | "needs_review"
  | "completed"
  | "partially_completed"
  | "abandoned"
  | "archived";

export type TripPlanningMode = "city_first" | "event_led";

export interface DateRange {
  start: string;
  end: string;
}

export interface FlightInfo {
  flightNumber?: string;
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;
}

export interface HotelInfo {
  name?: string;
  address?: string;
  checkInTime?: string;
  checkOutTime?: string;
}

export interface TripSegment {
  id: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  hotelInfo: HotelInfo;
  arrivalTransportNotes?: string;
  departureTransportNotes?: string;
}

export interface TripBudget {
  amount: number;
  currency: string;
  style: "lean" | "balanced" | "premium";
  dailySoftLimit?: number;
  hardCap?: number;
  transportBudget?: number;
  stayBudget?: number;
  eventBudget?: number;
  foodBudget?: number;
  contingencyBuffer?: number;
}

export interface TripPreferences {
  partyComposition: "solo" | "couple" | "friends" | "family";
  vibe: string[];
  foodInterests: string[];
  walkingTolerance: "low" | "medium" | "high";
  pace: "slow" | "balanced" | "dense";
  avoids: string[];
  mustSeeNotes: string;
  specialWishes: string;
  /** Food & drink planning stance — drives prompts, ranking, and curated culture layer. */
  foodDrinkPlanner?: FoodDrinkPlannerSettings;
  /**
   * Per-trip intensity for optional story-inspired suggestions.
   * Omitted = follow account defaults only (see {@link UserPreferences.storyTravel}).
   */
  storyInspirationLevel?: "off" | "subtle" | "balanced" | "themed";
}

export interface TravelExecutionProfile {
  explorationSpeed: "slow" | "standard" | "fast" | "very_fast";
  scheduleDensity: "relaxed" | "balanced" | "dense" | "extreme";
  attractionDwellStyle: "linger" | "standard" | "sample";
  walkingTempo: "slow" | "standard" | "brisk";
  transferTolerance: "low" | "medium" | "high";
  recoveryNeed: "low" | "medium" | "high";
  eventCentricity: "low" | "medium" | "high";
  priorityMode: "comfort" | "balanced" | "maximum_density";
}

export interface AnchorEvent {
  id: string;
  type: "concert" | "festival" | "show" | "sports" | "exhibition" | "other";
  title: string;
  artistOrSeries?: string;
  city: string;
  country: string;
  countryCode?: string;
  venue: string;
  startAt: string;
  endAt?: string;
  bufferDaysBefore?: number;
  bufferDaysAfter?: number;
  locked: boolean;
  ticketStatus: "interested" | "planned" | "booked";
  genreTags: string[];
  timezone?: string;
  sourceUrl?: string;
  imageUrl?: string;
  ticketUrl?: string;
  provider?: "ticketmaster" | "bandsintown" | "songkick" | "manual" | "fallback";
  providerEventId?: string;
  latitude?: number;
  longitude?: number;
  festivalSelection?: FestivalSelection;
}

export interface IntercityMove {
  id: string;
  fromSegmentId: string;
  toSegmentId: string;
  transportCandidates: Array<{
    type: "train" | "flight" | "bus" | "ferry" | "custom";
    estimatedDurationMinutes: number;
    stationOrAirportTransferMinutes: number;
    bufferMinutes: number;
    baggageFriction: "low" | "medium" | "high";
    estimatedCost?: { min: number; max: number; currency: string; approximate: boolean };
    sourceSnapshot?: string;
    feasibility: "easy" | "possible" | "tight" | "risky" | "unrealistic";
  }>;
}

export interface TravelSupportPlan {
  timezones: Array<{ segmentId: string; timezone?: string; utcOffsetMinutes?: number }>;
  jetLag: {
    expectedShiftHours?: number;
    arrivalFatigue: "low" | "medium" | "high";
    guidance: string[];
  };
  preDepartureChecklist: Array<{
    id: string;
    label: string;
    category: "documents" | "weather" | "tickets" | "transport" | "packing" | "health";
    done: boolean;
  }>;
  clothingReminders: string[];
  railPassConsideration?: {
    worthConsidering: boolean;
    rationale: string;
    confidence: "low" | "medium" | "high";
  };
}

export interface Trip {
  id: string;
  userId: string;
  title: string;
  destination: string;
  tripSegments: TripSegment[];
  dateRange: DateRange;
  flightInfo: FlightInfo;
  hotelInfo: HotelInfo;
  budget: TripBudget;
  preferences: TripPreferences;
  executionProfile?: TravelExecutionProfile;
  anchorEvents?: AnchorEvent[];
  intercityMoves?: IntercityMove[];
  travelSupport?: TravelSupportPlan;
  status: TripCompletionStatus;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt: string | null;
  planVersion: number;
  /** Persisted data model version; omitted on legacy documents (treated as v1). */
  schemaVersion?: number;
  /** When true, anonymous clients may read this trip and its days if an active share link exists. */
  publicReadEnabled?: boolean;
}

export interface TripSummary {
  id: string;
  userId: string;
  title: string;
  destination: string;
  dateRange: DateRange;
  status: TripCompletionStatus;
  warningCount: number;
  nextActionLabel: string;
  updatedAt: string;
}
