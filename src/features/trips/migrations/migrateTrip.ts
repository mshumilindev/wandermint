import type { ActivityBlock, NormalizedTripPlanItemFields } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";
import { timeToMinutes } from "../pacing/planTimeUtils";
import { TRIP_SCHEMA_VERSION_CURRENT, TRIP_SCHEMA_VERSION_LEGACY_IMPLICIT } from "./tripMigrationVersion";
import type { TripMigrationResult } from "./tripMigration.types";

export const getTripSchemaVersion = (trip: Trip): number =>
  typeof trip.schemaVersion === "number" && trip.schemaVersion >= 1 ? trip.schemaVersion : TRIP_SCHEMA_VERSION_LEGACY_IMPLICIT;

const hasLatLng = (block: ActivityBlock): boolean => {
  const lat = block.place?.latitude;
  const lng = block.place?.longitude;
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
};

const mapActivityPriorityToNormalized = (priority: ActivityBlock["priority"]): NormalizedTripPlanItemFields["priority"] => {
  if (priority === "must") {
    return "must";
  }
  if (priority === "should") {
    return "high";
  }
  return "medium";
};

const mapCompletionToPlanStatus = (completion: ActivityBlock["completionStatus"]): NormalizedTripPlanItemFields["status"] => {
  if (completion === "done") {
    return "completed";
  }
  if (completion === "skipped" || completion === "cancelled_by_replan") {
    return "skipped";
  }
  return "planned";
};

const durationFromWallTimes = (startTime: string, endTime: string): number => {
  const s = startTime?.trim() ?? "";
  const e = endTime?.trim() ?? "";
  if (!s || !e) {
    return 60;
  }
  let a = timeToMinutes(s);
  let b = timeToMinutes(e);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 60;
  }
  if (b < a) {
    b += 24 * 60;
  }
  const d = b - a;
  return d > 0 ? d : 60;
};

const sortBlocksForTimeline = (blocks: ActivityBlock[]): ActivityBlock[] =>
  [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));

const cloneBlockPreservingLegacy = (block: ActivityBlock): ActivityBlock => ({ ...block });

const buildNormalizedForBlock = (block: ActivityBlock, sortedIndex: number): NormalizedTripPlanItemFields => ({
  priority: mapActivityPriorityToNormalized(block.priority),
  status: mapCompletionToPlanStatus(block.completionStatus),
  estimatedDurationMinutes: durationFromWallTimes(block.startTime, block.endTime),
  travelTimeFromPreviousMinutes: sortedIndex === 0 ? 0 : null,
  imageUrl: undefined,
  locationResolutionStatus: hasLatLng(block) ? "resolved" : "missing",
});

const normalizedEquals = (a: NormalizedTripPlanItemFields, b: NormalizedTripPlanItemFields): boolean =>
  a.priority === b.priority &&
  a.status === b.status &&
  a.estimatedDurationMinutes === b.estimatedDurationMinutes &&
  a.travelTimeFromPreviousMinutes === b.travelTimeFromPreviousMinutes &&
  a.imageUrl === b.imageUrl &&
  a.locationResolutionStatus === b.locationResolutionStatus;

const migrateDayPlan = (day: DayPlan): { day: DayPlan; changed: boolean } => {
  const sorted = sortBlocksForTimeline(day.blocks);
  const orderIndex = new Map(sorted.map((b, i) => [b.id, i]));
  let anyBlockChanged = false;
  const nextBlocks = day.blocks.map((block) => {
    const idx = orderIndex.get(block.id) ?? 0;
    const nextNorm = buildNormalizedForBlock(block, idx);
    const prev = block.normalizedTripPlanItem;
    if (prev && normalizedEquals(prev, nextNorm)) {
      return cloneBlockPreservingLegacy(block);
    }
    anyBlockChanged = true;
    return {
      ...cloneBlockPreservingLegacy(block),
      normalizedTripPlanItem: nextNorm,
    };
  });

  const missingWallTime = day.blocks.some((b) => !b.startTime?.trim() || !b.endTime?.trim());
  let validationStatus = day.validationStatus;
  let validationChanged = false;
  if (missingWallTime && validationStatus !== "failed" && validationStatus !== "needs_review") {
    validationStatus = "needs_review";
    validationChanged = true;
  }

  const nextDay: DayPlan = {
    ...day,
    blocks: nextBlocks,
    validationStatus,
  };

  return { day: nextDay, changed: anyBlockChanged || validationChanged };
};

const shallowCloneTripPreservingLegacy = (trip: Trip): Trip => ({ ...trip });

export const needsTripPlanMigration = (trip: Trip, days: DayPlan[]): boolean => {
  if (getTripSchemaVersion(trip) < TRIP_SCHEMA_VERSION_CURRENT) {
    return true;
  }
  return days.some((d) => d.blocks.some((b) => !b.normalizedTripPlanItem));
};

/**
 * Deterministic v1 → v2 migration: sets `trip.schemaVersion`, attaches `normalizedTripPlanItem` on each block,
 * and flags days missing wall-clock times for review. Does not mutate inputs.
 */
export const migrateTripAndDays = (trip: Trip, days: DayPlan[]): TripMigrationResult => {
  const version = getTripSchemaVersion(trip);
  const tripNeedsVersionBump = version < TRIP_SCHEMA_VERSION_CURRENT;

  const clonedDays = days.map((d) => ({ ...d, blocks: d.blocks.map(cloneBlockPreservingLegacy) }));
  const migratedPieces = clonedDays.map((d) => migrateDayPlan(d));
  const anyDayChanged = migratedPieces.some((r) => r.changed);

  if (!tripNeedsVersionBump && !anyDayChanged) {
    return {
      trip: shallowCloneTripPreservingLegacy(trip),
      days: days.map((d) => ({ ...d, blocks: d.blocks.map(cloneBlockPreservingLegacy) })),
      changed: false,
    };
  }

  const nextTrip: Trip = {
    ...shallowCloneTripPreservingLegacy(trip),
    schemaVersion: TRIP_SCHEMA_VERSION_CURRENT,
  };

  return {
    trip: nextTrip,
    days: migratedPieces.map((r) => r.day),
    changed: true,
  };
};
