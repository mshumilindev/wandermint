import { z } from "zod";

export const costRangeSchema = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  currency: z.string().min(3),
  certainty: z.enum(["exact", "estimated", "unknown"]),
});

export const placeSnapshotSchema = z.object({
  provider: z.string(),
  providerPlaceId: z.string().optional(),
  name: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  openingHoursLabel: z.string().optional(),
  priceLevel: z.number().optional(),
  rating: z.number().optional(),
  capturedAt: z.string(),
  planningSource: z.literal("bucket_list").optional(),
  bucketListItemId: z.string().optional(),
});

const normalizedTripPlanItemSchema = z.object({
  priority: z.enum(["must", "high", "medium", "low"]),
  status: z.enum(["planned", "completed", "skipped"]),
  estimatedDurationMinutes: z.number().nonnegative(),
  travelTimeFromPreviousMinutes: z.number().nullable(),
  imageUrl: z.string().optional(),
  locationResolutionStatus: z.enum(["resolved", "missing", "estimated"]),
});

export const activityBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["activity", "meal", "transfer", "rest"]),
  title: z.string(),
  description: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  place: placeSnapshotSchema.optional(),
  category: z.string(),
  tags: z.array(z.string()),
  indoorOutdoor: z.enum(["indoor", "outdoor", "mixed"]),
  estimatedCost: costRangeSchema,
  dependencies: z.object({
    weatherSensitive: z.boolean(),
    bookingRequired: z.boolean(),
    openingHoursSensitive: z.boolean(),
    priceSensitive: z.boolean(),
  }),
  alternatives: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      reason: z.string(),
      estimatedCost: costRangeSchema.optional(),
      place: placeSnapshotSchema.optional(),
    }),
  ),
  sourceSnapshots: z.array(placeSnapshotSchema),
  priority: z.enum(["must", "should", "optional"]),
  locked: z.boolean(),
  completionStatus: z.enum(["pending", "in_progress", "unconfirmed", "done", "skipped", "missed", "cancelled_by_replan"]),
  normalizedTripPlanItem: normalizedTripPlanItemSchema.optional(),
  safetyWarningAcknowledged: z.boolean().optional(),
});

export const movementOptionSchema = z.object({
  mode: z.enum(["walking", "public_transport", "taxi"]),
  durationMinutes: z.number().int().nonnegative(),
  estimatedCost: costRangeSchema.optional(),
  certainty: z.enum(["live", "partial"]),
  sourceName: z.string(),
  estimateConfidence: z.enum(["high", "medium", "low"]).optional(),
});

export const movementLegSchema = z.object({
  id: z.string(),
  fromBlockId: z.string(),
  toBlockId: z.string(),
  summary: z.string(),
  distanceMeters: z.number().nonnegative().optional(),
  primary: movementOptionSchema,
  alternatives: z.array(movementOptionSchema),
});

export const planWarningSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tripId: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  type: z.enum(["weather_change", "price_change", "availability_change", "opening_hours_change", "route_issue"]),
  message: z.string(),
  affectedBlockIds: z.array(z.string()),
  suggestedAction: z.string(),
  createdAt: z.string(),
  acknowledgedAt: z.string().optional(),
});

export const dayPlanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tripId: z.string(),
  segmentId: z.string(),
  cityLabel: z.string(),
  countryLabel: z.string().optional(),
  date: z.string(),
  theme: z.string(),
  blocks: z.array(activityBlockSchema),
  movementLegs: z.array(movementLegSchema).optional(),
  estimatedCostRange: costRangeSchema,
  validationStatus: z.enum(["fresh", "stale", "needs_review", "partial", "failed"]),
  warnings: z.array(planWarningSchema),
  completionStatus: z.enum(["pending", "in_progress", "needs_review", "done", "partially_done", "skipped", "replanned"]),
  adjustment: z
    .object({
      state: z.enum(["as_planned", "late_start", "low_energy", "sick_day", "stay_in_day", "weather_reset", "travel_delay", "early_finish"]),
      note: z.string().optional(),
      updatedAt: z.string(),
    })
    .optional(),
  updatedAt: z.string(),
});
