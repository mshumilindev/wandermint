import type { OpeningHours } from "../places/opening-hours/openingHours.types";
import type { TransportMode } from "../transport/transport.types";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";

/** User pacing affects buffers and optional cadence rest. */
export type TripSolverPace = "slow" | "balanced" | "dense";

export type MealRestRequirement = {
  /** Stable id for inserted solver rows (e.g. `lunch`). */
  id: string;
  kind: "meal" | "rest";
  /** Earliest wall time (minutes from midnight, same calendar day as `dayDate`). */
  earliestStartWallMinutes: number;
  /** Latest wall time by which this block must **start** (minutes from midnight). */
  latestStartWallMinutes: number;
  durationMinutes: number;
  /** Shown on inserted items. */
  label?: string;
};

export type SolveTripDayInput = {
  /** Unordered or AI-ordered candidates; the solver produces the final sequence. */
  candidates: TripPlanItem[];
  /** `YYYY-MM-DD` in `timezone`. */
  dayDate: string;
  dayStartTime: string;
  dayEndTime: string;
  timezone: string;
  transportMode?: TransportMode;
  /** When set, used with {@link validatePlanWindowAgainstOpeningHours}; missing entry → unknown (not rejected as closed). */
  openingHoursByItemId?: Readonly<Record<string, OpeningHours | null | undefined>>;
  /** Optional daily cap; requires {@link estimatedSpendCentsByItemId} for items that spend. */
  budgetDailyMaxCents?: number;
  estimatedSpendCentsByItemId?: Readonly<Record<string, number>>;
  /** Extra spend already committed for the day (cents). */
  baselineSpendCents?: number;
  pace?: TripSolverPace;
  mealRestRequirements?: readonly MealRestRequirement[];
  /** Geo clustering linkage (meters); defaults to 400. */
  clusterLinkageMeters?: number;
};

export type RejectedTripPlanItem = {
  item: TripPlanItem;
  reason: string;
};

export type SolvedTripDay = {
  items: TripPlanItem[];
  rejectedItems: RejectedTripPlanItem[];
  /** 0 = hard infeasibility (e.g. dropped must-have). Between 0 and 1 otherwise. */
  feasibilityScore: number;
  /**
   * Non-empty when hard constraints could not be met. Consumers must surface this
   * (Rule 6: never accept an infeasible day silently).
   */
  infeasibilityReasons: string[];
};
