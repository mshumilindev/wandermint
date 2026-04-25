import type { ActivityBlock } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";

const cost = { min: 0, max: 10, currency: "EUR", certainty: "estimated" as const };
const deps = {
  weatherSensitive: false,
  bookingRequired: false,
  openingHoursSensitive: false,
  priceSensitive: false,
};

export const block = (overrides: Partial<ActivityBlock> & Pick<ActivityBlock, "id" | "startTime" | "endTime" | "title">): ActivityBlock => ({
  type: "activity",
  description: "",
  category: "sightseeing",
  tags: [],
  indoorOutdoor: "outdoor",
  estimatedCost: cost,
  dependencies: deps,
  alternatives: [],
  sourceSnapshots: [],
  priority: "should",
  locked: false,
  completionStatus: "pending",
  ...overrides,
});

export const dayPlan = (overrides: Partial<DayPlan> & Pick<DayPlan, "id" | "date" | "blocks">): DayPlan => ({
  userId: "u1",
  tripId: "trip1",
  segmentId: "seg1",
  cityLabel: "Paris",
  theme: "Day",
  estimatedCostRange: cost,
  validationStatus: "fresh",
  warnings: [],
  completionStatus: "pending",
  updatedAt: "2026-04-24T00:00:00Z",
  ...overrides,
});
