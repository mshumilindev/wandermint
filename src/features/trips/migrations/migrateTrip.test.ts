import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOfflineQueue, enqueueOfflineMutation, peekOfflineQueue } from "../../offline/offlineSyncQueue";
import type { ActivityBlock } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";
import { TRIP_SCHEMA_VERSION_CURRENT } from "./tripMigrationVersion";
import { getTripSchemaVersion, migrateTripAndDays, needsTripPlanMigration } from "./migrateTrip";

const baseBlock = (overrides: Partial<ActivityBlock> & Pick<ActivityBlock, "id" | "startTime" | "endTime">): ActivityBlock => ({
  type: "activity",
  title: "Stop",
  description: "",
  category: "sightseeing",
  tags: [],
  indoorOutdoor: "outdoor",
  estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
  dependencies: { weatherSensitive: false, bookingRequired: false, openingHoursSensitive: false, priceSensitive: false },
  alternatives: [],
  sourceSnapshots: [],
  priority: "should",
  locked: false,
  completionStatus: "pending",
  ...overrides,
});

const baseDay = (overrides: Partial<DayPlan> & Pick<DayPlan, "id" | "blocks">): DayPlan => ({
  userId: "u1",
  tripId: "t1",
  segmentId: "s1",
  cityLabel: "Paris",
  date: "2025-06-01",
  theme: "Day 1",
  estimatedCostRange: { min: 0, max: 1, currency: "EUR", certainty: "unknown" },
  validationStatus: "fresh",
  warnings: [],
  completionStatus: "pending",
  updatedAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

const baseTrip = (overrides: Partial<Trip> = {}): Trip => ({
  id: "t1",
  userId: "u1",
  title: "Paris",
  destination: "Paris, France",
  tripSegments: [
    {
      id: "s1",
      city: "Paris",
      country: "FR",
      startDate: "2025-06-01",
      endDate: "2025-06-02",
      hotelInfo: {},
    },
  ],
  dateRange: { start: "2025-06-01", end: "2025-06-03" },
  flightInfo: {},
  hotelInfo: {},
  budget: { amount: 100, currency: "EUR", style: "balanced" },
  preferences: {
    partyComposition: "solo",
    vibe: [],
    foodInterests: [],
    walkingTolerance: "medium",
    pace: "balanced",
    avoids: [],
    mustSeeNotes: "",
    specialWishes: "",
  },
  status: "active",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  lastValidatedAt: null,
  planVersion: 1,
  ...overrides,
});

describe("migrateTrip v1 → v2", () => {
  it("treats missing schemaVersion as v1", () => {
    expect(getTripSchemaVersion(baseTrip())).toBe(1);
    expect(getTripSchemaVersion(baseTrip({ schemaVersion: 2 }))).toBe(2);
  });

  it("bumps trip schemaVersion and attaches normalizedTripPlanItem on each block", () => {
    const trip = baseTrip();
    const day = baseDay({
      id: "d1",
      blocks: [
        baseBlock({ id: "b1", startTime: "09:00", endTime: "10:00" }),
        baseBlock({
          id: "b2",
          startTime: "11:00",
          endTime: "12:00",
          priority: "optional",
          completionStatus: "done",
          place: {
            provider: "test",
            name: "Cafe",
            latitude: 48.86,
            longitude: 2.35,
            capturedAt: "2025-01-01T00:00:00.000Z",
          },
        }),
      ],
    });

    const { trip: outTrip, days, changed } = migrateTripAndDays(trip, [day]);
    expect(changed).toBe(true);
    expect(outTrip.schemaVersion).toBe(TRIP_SCHEMA_VERSION_CURRENT);
    expect(days[0]?.blocks[0]?.normalizedTripPlanItem).toMatchObject({
      priority: "high",
      status: "planned",
      estimatedDurationMinutes: 60,
      travelTimeFromPreviousMinutes: 0,
      locationResolutionStatus: "missing",
    });
    expect(days[0]?.blocks[1]?.normalizedTripPlanItem).toMatchObject({
      priority: "medium",
      status: "completed",
      travelTimeFromPreviousMinutes: null,
      locationResolutionStatus: "resolved",
    });
  });

  it("marks day validation needs_review when wall times are missing", () => {
    const trip = baseTrip();
    const day = baseDay({
      id: "d1",
      validationStatus: "fresh",
      blocks: [baseBlock({ id: "b1", startTime: "", endTime: "10:00" })],
    });
    const { days, changed } = migrateTripAndDays(trip, [day]);
    expect(changed).toBe(true);
    expect(days[0]?.validationStatus).toBe("needs_review");
  });

  it("does not downgrade failed validation status", () => {
    const trip = baseTrip();
    const day = baseDay({
      id: "d1",
      validationStatus: "failed",
      blocks: [baseBlock({ id: "b1", startTime: "", endTime: "" })],
    });
    const { days } = migrateTripAndDays(trip, [day]);
    expect(days[0]?.validationStatus).toBe("failed");
  });

  it("preserves unknown legacy keys on trip and blocks in migration output", () => {
    const trip = { ...baseTrip(), legacyTripFlag: true } as unknown as Trip;
    const block = { ...baseBlock({ id: "b1", startTime: "09:00", endTime: "10:00" }), legacyBlockNote: "keep-me" } as unknown as ActivityBlock;
    const day = baseDay({ id: "d1", blocks: [block] });
    const { trip: outTrip, days } = migrateTripAndDays(trip, [day]);
    expect((outTrip as unknown as { legacyTripFlag?: boolean }).legacyTripFlag).toBe(true);
    expect((days[0]?.blocks[0] as unknown as { legacyBlockNote?: string }).legacyBlockNote).toBe("keep-me");
  });

  it("is deterministic and idempotent for the same inputs", () => {
    const trip = baseTrip();
    const day = baseDay({
      id: "d1",
      blocks: [baseBlock({ id: "b1", startTime: "09:00", endTime: "10:00" })],
    });
    const a = migrateTripAndDays(trip, [day]);
    const b = migrateTripAndDays(a.trip, a.days);
    expect(a.changed).toBe(true);
    expect(b.changed).toBe(false);
    expect(b.trip.schemaVersion).toBe(TRIP_SCHEMA_VERSION_CURRENT);
    expect(b.days[0]?.blocks[0]?.normalizedTripPlanItem).toEqual(a.days[0]?.blocks[0]?.normalizedTripPlanItem);
  });

  it("needsTripPlanMigration is false after successful migration output", () => {
    const trip = baseTrip();
    const day = baseDay({
      id: "d1",
      blocks: [baseBlock({ id: "b1", startTime: "09:00", endTime: "10:00" })],
    });
    const migrated = migrateTripAndDays(trip, [day]);
    expect(needsTripPlanMigration(migrated.trip, migrated.days)).toBe(false);
  });

  it("migrates trip document when there are no days (schema bump only)", () => {
    const trip = baseTrip();
    const { trip: out, changed } = migrateTripAndDays(trip, []);
    expect(changed).toBe(true);
    expect(out.schemaVersion).toBe(TRIP_SCHEMA_VERSION_CURRENT);
  });
});

describe("offline activity_completion queue", () => {
  const memory: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      get length() {
        return Object.keys(memory).length;
      },
      clear: () => {
        Object.keys(memory).forEach((k) => {
          delete memory[k];
        });
      },
      getItem: (key: string) => (key in memory ? memory[key]! : null),
      setItem: (key: string, value: string) => {
        memory[key] = value;
      },
      removeItem: (key: string) => {
        delete memory[key];
      },
      key: (index: number) => Object.keys(memory)[index] ?? null,
    });
    clearOfflineQueue();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearOfflineQueue();
    vi.unstubAllGlobals();
  });

  it("dedupes repeated offline mutations for the same block, keeping the latest status", () => {
    vi.setSystemTime(1_000);
    enqueueOfflineMutation({
      userId: "u1",
      tripId: "t1",
      dayId: "d1",
      blockId: "b1",
      status: "done",
      previousStatus: "pending",
    });
    vi.setSystemTime(5_000);
    enqueueOfflineMutation({
      userId: "u1",
      tripId: "t1",
      dayId: "d1",
      blockId: "b1",
      status: "skipped",
      previousStatus: "done",
    });
    const q = peekOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0]?.type).toBe("activity_completion");
    if (q[0]?.type === "activity_completion") {
      expect(q[0].status).toBe("skipped");
    }
  });
});
