import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";

export interface TripMigrationResult {
  trip: Trip;
  days: DayPlan[];
  /** True when output differs from inputs (including new optional fields). */
  changed: boolean;
}
