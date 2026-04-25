import { z } from "zod";
import { dayPlanSchema } from "../../../entities/day-plan/schemas";
import { replanProposalSchema } from "../../../entities/replan/schemas";
import {
  anchorEventSchema,
  dateRangeSchema,
  hotelInfoSchema,
  tripBudgetSchema,
  tripPreferencesSchema,
  travelExecutionProfileSchema,
  tripSchema,
  tripSegmentSchema,
} from "../../../entities/trip/schemas";
import { tripChatMessageSchema } from "../../firebase/repositories/tripChatRepository";

/** Appended on the second AI attempt after a failed output parse (no user content). */
export const gatewayRetryContextSchema = z.object({
  validationIssueSummary: z.string().max(12000),
  paths: z.array(z.string()).max(120),
});

const tripGenerationDraftSchema = z
  .object({
    userId: z.string().min(1),
    planningMode: z.enum(["city_first", "event_led"]),
    destination: z.string().min(1),
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
    executionProfile: travelExecutionProfileSchema,
    anchorEvents: z.array(anchorEventSchema),
  })
  .passthrough();

export const tripOptionPlanSchema = z.object({
  min: z.number().int().min(1).max(5),
  target: z.number().int().min(1).max(5),
  max: z.number().int().min(1).max(5),
  reason: z.string().max(2000),
});

export const tripGenerationPayloadSchema = z
  .object({
    draft: tripGenerationDraftSchema,
    prompt: z.string().min(1).max(450_000),
    forecast: z.array(z.unknown()),
    places: z.array(z.unknown()),
    destinationDiscovery: z.unknown(),
    intercityMoves: z.unknown(),
    travelSupport: z.unknown(),
    tripOptionPlan: tripOptionPlanSchema.optional(),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

export const tripChatReplanPayloadSchema = z.object({
  trip: tripSchema,
  days: z.array(dayPlanSchema).max(60),
  warnings: z.array(z.record(z.unknown())).max(200),
  recentMessages: z.array(tripChatMessageSchema).max(50),
  userRequest: z.string().min(1).max(16_000),
  gatewayRetryContext: gatewayRetryContextSchema.optional(),
});

export const tripRevalidationPayloadSchema = z.object({
  trip: tripSchema,
  days: z.array(dayPlanSchema).max(60),
  warnings: z.array(z.record(z.unknown())).max(200),
  forecastDigest: z.array(z.unknown()).max(200).optional(),
  providerNotes: z.array(z.string().max(2000)).max(100).optional(),
  gatewayRetryContext: gatewayRetryContextSchema.optional(),
});

export const unfinishedDayRecoveryPayloadSchema = z.object({
  trip: tripSchema,
  day: dayPlanSchema,
  heuristics: z.array(z.string().max(500)).max(80).optional(),
  seedProposal: replanProposalSchema.optional(),
  gatewayRetryContext: gatewayRetryContextSchema.optional(),
});

export const preferenceLearningPayloadSchema = z.object({
  trip: tripSchema,
  signalDigest: z.record(z.unknown()),
  preferencesSnapshot: z.record(z.unknown()).optional(),
  gatewayRetryContext: gatewayRetryContextSchema.optional(),
});

export const postTripAnalysisPayloadSchema = z.object({
  trip: tripSchema,
  reviewFacts: z.record(z.unknown()),
  metricsDigest: z.record(z.unknown()).optional(),
  gatewayRetryContext: gatewayRetryContextSchema.optional(),
});

export const liveDecisionSupportPayloadSchema = z.object({
  tripId: z.string().min(1),
  dayId: z.string().min(1),
  executionState: z.record(z.unknown()),
  locale: z.string().max(80).optional(),
  gatewayRetryContext: gatewayRetryContextSchema.optional(),
});

export type TripGenerationGatewayPayload = z.infer<typeof tripGenerationPayloadSchema>;
export type TripChatReplanGatewayPayload = z.infer<typeof tripChatReplanPayloadSchema>;
export type TripRevalidationGatewayPayload = z.infer<typeof tripRevalidationPayloadSchema>;
export type UnfinishedDayRecoveryGatewayPayload = z.infer<typeof unfinishedDayRecoveryPayloadSchema>;
export type PreferenceLearningGatewayPayload = z.infer<typeof preferenceLearningPayloadSchema>;
export type PostTripAnalysisGatewayPayload = z.infer<typeof postTripAnalysisPayloadSchema>;
export type LiveDecisionSupportGatewayPayload = z.infer<typeof liveDecisionSupportPayloadSchema>;
