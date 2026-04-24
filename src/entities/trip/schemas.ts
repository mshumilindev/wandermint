import { z } from "zod";

export const dateRangeSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});

export const tripBudgetSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(3),
  style: z.enum(["lean", "balanced", "premium"]),
  dailySoftLimit: z.number().nonnegative().optional(),
  hardCap: z.number().nonnegative().optional(),
  transportBudget: z.number().nonnegative().optional(),
  stayBudget: z.number().nonnegative().optional(),
  eventBudget: z.number().nonnegative().optional(),
  foodBudget: z.number().nonnegative().optional(),
  contingencyBuffer: z.number().nonnegative().optional(),
});

export const tripPreferencesSchema = z.object({
  partyComposition: z.enum(["solo", "couple", "friends", "family"]),
  vibe: z.array(z.string()),
  foodInterests: z.array(z.string()),
  walkingTolerance: z.enum(["low", "medium", "high"]),
  pace: z.enum(["slow", "balanced", "dense"]),
  avoids: z.array(z.string()),
  mustSeeNotes: z.string().default(""),
  specialWishes: z.string(),
});

export const hotelInfoSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
});

export const tripSegmentSchema = z.object({
  id: z.string(),
  city: z.string(),
  country: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  hotelInfo: hotelInfoSchema,
  arrivalTransportNotes: z.string().optional(),
  departureTransportNotes: z.string().optional(),
});

export const travelExecutionProfileSchema = z.object({
  explorationSpeed: z.enum(["slow", "standard", "fast", "very_fast"]),
  scheduleDensity: z.enum(["relaxed", "balanced", "dense", "extreme"]),
  attractionDwellStyle: z.enum(["linger", "standard", "sample"]),
  walkingTempo: z.enum(["slow", "standard", "brisk"]),
  transferTolerance: z.enum(["low", "medium", "high"]),
  recoveryNeed: z.enum(["low", "medium", "high"]),
  eventCentricity: z.enum(["low", "medium", "high"]),
  priorityMode: z.enum(["comfort", "balanced", "maximum_density"]),
});

export const anchorEventSchema = z.object({
  id: z.string(),
  type: z.enum(["concert", "festival", "show", "sports", "exhibition", "other"]),
  title: z.string(),
  artistOrSeries: z.string().optional(),
  city: z.string(),
  country: z.string(),
  venue: z.string(),
  startAt: z.string(),
  endAt: z.string().optional(),
  bufferDaysBefore: z.number().nonnegative().optional(),
  bufferDaysAfter: z.number().nonnegative().optional(),
  locked: z.boolean(),
  ticketStatus: z.enum(["interested", "planned", "booked"]),
  genreTags: z.array(z.string()),
});

export const intercityMoveSchema = z.object({
  id: z.string(),
  fromSegmentId: z.string(),
  toSegmentId: z.string(),
  transportCandidates: z.array(z.object({
    type: z.enum(["train", "flight", "bus", "ferry", "custom"]),
    estimatedDurationMinutes: z.number().nonnegative(),
    stationOrAirportTransferMinutes: z.number().nonnegative(),
    bufferMinutes: z.number().nonnegative(),
    baggageFriction: z.enum(["low", "medium", "high"]),
    estimatedCost: z.object({ min: z.number(), max: z.number(), currency: z.string(), approximate: z.boolean() }).optional(),
    sourceSnapshot: z.string().optional(),
    feasibility: z.enum(["easy", "possible", "tight", "risky", "unrealistic"]),
  })),
});

export const travelSupportSchema = z.object({
  timezones: z.array(z.object({ segmentId: z.string(), timezone: z.string().optional(), utcOffsetMinutes: z.number().optional() })),
  jetLag: z.object({
    expectedShiftHours: z.number().optional(),
    arrivalFatigue: z.enum(["low", "medium", "high"]),
    guidance: z.array(z.string()),
  }),
  preDepartureChecklist: z.array(z.object({
    id: z.string(),
    label: z.string(),
    category: z.enum(["documents", "weather", "tickets", "transport", "packing", "health"]),
    done: z.boolean(),
  })),
  clothingReminders: z.array(z.string()),
  railPassConsideration: z.object({
    worthConsidering: z.boolean(),
    rationale: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
  }).optional(),
});

export const tripSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  destination: z.string(),
  tripSegments: z.array(tripSegmentSchema).min(1),
  dateRange: dateRangeSchema,
  flightInfo: z.object({
    flightNumber: z.string().optional(),
    arrivalTime: z.string().optional(),
    departureTime: z.string().optional(),
    notes: z.string().optional(),
  }),
  hotelInfo: hotelInfoSchema,
  budget: tripBudgetSchema,
  preferences: tripPreferencesSchema,
  executionProfile: travelExecutionProfileSchema.optional(),
  anchorEvents: z.array(anchorEventSchema).optional(),
  intercityMoves: z.array(intercityMoveSchema).optional(),
  travelSupport: travelSupportSchema.optional(),
  status: z.enum(["draft", "active", "needs_review", "completed", "partially_completed", "abandoned", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastValidatedAt: z.string().nullable(),
  planVersion: z.number().int().nonnegative(),
});
