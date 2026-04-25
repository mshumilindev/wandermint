import { z } from "zod";

/** Shallow structural checks only (no PII in logs). Keep aligned with client `src/services/ai/gateway/flowPayloadSchemas.ts`. */

const gatewayRetryContextSchema = z.object({
  validationIssueSummary: z.string().max(12000),
  paths: z.array(z.string()).max(120),
});

const tripGenerationPayloadGuard = z
  .object({
    draft: z.record(z.unknown()),
    prompt: z.string().min(1).max(500_000),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

const tripChatReplanPayloadGuard = z
  .object({
    trip: z.record(z.unknown()),
    days: z.array(z.unknown()).max(80),
    warnings: z.array(z.unknown()).max(200),
    recentMessages: z.array(z.unknown()).max(50),
    userRequest: z.string().min(1).max(20_000),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

const tripRevalidationPayloadGuard = z
  .object({
    trip: z.record(z.unknown()),
    days: z.array(z.unknown()).max(80),
    warnings: z.array(z.unknown()).max(200),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

const unfinishedDayRecoveryPayloadGuard = z
  .object({
    trip: z.record(z.unknown()),
    day: z.record(z.unknown()),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

const preferenceLearningPayloadGuard = z
  .object({
    trip: z.record(z.unknown()),
    signalDigest: z.record(z.unknown()),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

const postTripAnalysisPayloadGuard = z
  .object({
    trip: z.record(z.unknown()),
    reviewFacts: z.record(z.unknown()),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

const liveDecisionSupportPayloadGuard = z
  .object({
    tripId: z.string().min(1).max(200),
    dayId: z.string().min(1).max(200),
    executionState: z.record(z.unknown()),
    gatewayRetryContext: gatewayRetryContextSchema.optional(),
  })
  .passthrough();

const localScenarioPayloadGuard = z
  .object({
    request: z.record(z.unknown()).optional(),
  })
  .passthrough();

const localScenarioChatPayloadGuard = z.record(z.unknown());

export type ServerAiFlow =
  | "trip_generation"
  | "local_scenario"
  | "local_scenario_chat"
  | "trip_chat_replan"
  | "trip_revalidation"
  | "unfinished_day_recovery"
  | "preference_learning"
  | "post_trip_analysis"
  | "live_decision_support";

export const validateGatewayPayloadForFlow = (flow: ServerAiFlow, payload: unknown): z.SafeParseReturnType<unknown, unknown> => {
  switch (flow) {
    case "trip_generation":
      return tripGenerationPayloadGuard.safeParse(payload);
    case "trip_chat_replan":
      return tripChatReplanPayloadGuard.safeParse(payload);
    case "trip_revalidation":
      return tripRevalidationPayloadGuard.safeParse(payload);
    case "unfinished_day_recovery":
      return unfinishedDayRecoveryPayloadGuard.safeParse(payload);
    case "preference_learning":
      return preferenceLearningPayloadGuard.safeParse(payload);
    case "post_trip_analysis":
      return postTripAnalysisPayloadGuard.safeParse(payload);
    case "live_decision_support":
      return liveDecisionSupportPayloadGuard.safeParse(payload);
    case "local_scenario":
      return localScenarioPayloadGuard.safeParse(payload);
    case "local_scenario_chat":
      return localScenarioChatPayloadGuard.safeParse(payload);
  }
};

export const safePayloadMeta = (flow: ServerAiFlow, payload: Record<string, unknown>): Record<string, number | boolean> => {
  switch (flow) {
    case "trip_generation":
      return {
        hasDraft: typeof payload.draft === "object" && payload.draft !== null,
        promptLen: typeof payload.prompt === "string" ? payload.prompt.length : 0,
        hasRetry: Boolean(payload.gatewayRetryContext),
      };
    case "trip_chat_replan":
      return {
        dayCount: Array.isArray(payload.days) ? payload.days.length : 0,
        messageCount: Array.isArray(payload.recentMessages) ? payload.recentMessages.length : 0,
        userRequestLen: typeof payload.userRequest === "string" ? payload.userRequest.length : 0,
        hasRetry: Boolean(payload.gatewayRetryContext),
      };
    case "trip_revalidation":
      return {
        dayCount: Array.isArray(payload.days) ? payload.days.length : 0,
        warningCount: Array.isArray(payload.warnings) ? payload.warnings.length : 0,
        hasRetry: Boolean(payload.gatewayRetryContext),
      };
    case "unfinished_day_recovery":
      return { hasDay: Boolean(payload.day), hasRetry: Boolean(payload.gatewayRetryContext) };
    case "preference_learning":
      return { hasSignal: Boolean(payload.signalDigest), hasRetry: Boolean(payload.gatewayRetryContext) };
    case "post_trip_analysis":
      return { hasReviewFacts: Boolean(payload.reviewFacts), hasRetry: Boolean(payload.gatewayRetryContext) };
    case "live_decision_support":
      return {
        tripIdLen: typeof payload.tripId === "string" ? payload.tripId.length : 0,
        dayIdLen: typeof payload.dayId === "string" ? payload.dayId.length : 0,
        hasState: Boolean(payload.executionState),
        hasRetry: Boolean(payload.gatewayRetryContext),
      };
    case "local_scenario":
      return { hasRequest: Boolean(payload.request) };
    case "local_scenario_chat":
      return { keyCount: Object.keys(payload).length };
    default:
      return {};
  }
};
