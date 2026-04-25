import type { SafeParseReturnType } from "zod";
import { AiGatewayError, AiValidationError, ProviderUnavailableError } from "../../shared/lib/appErrors";
import { buildAiValidationError } from "../../shared/lib/errors";
import {
  normalizeChatReplanResponse,
  normalizeGeneratedLocalScenarios,
  normalizeGeneratedTripOptions,
  normalizeLocalScenarioChatResponse,
} from "./aiResponseRepair";
import {
  chatReplanResponseSchema,
  generatedLocalScenariosSchema,
  generatedTripOptionsSchema,
  localScenarioChatResponseSchema,
  type ChatReplanResponse,
  type GeneratedLocalScenarios,
  type GeneratedTripOptions,
  type LocalScenarioChatResponse,
} from "./schemas";
import { firebaseAuth, firebaseProjectId } from "../firebase/firebaseApp";
import type { UserPreferences } from "../../entities/user/model";
import type { AiFlow } from "../../shared/lib/appErrors";
import type { PostTripAnalysisResponse, LiveDecisionSupportResponse } from "./gateway/flowOutputSchemas";
import {
  liveDecisionSupportPayloadSchema,
  postTripAnalysisPayloadSchema,
  preferenceLearningPayloadSchema,
  tripChatReplanPayloadSchema,
  tripGenerationPayloadSchema,
  tripRevalidationPayloadSchema,
  unfinishedDayRecoveryPayloadSchema,
  type TripGenerationGatewayPayload,
} from "./gateway/flowPayloadSchemas";
import { liveDecisionSupportResponseSchema, postTripAnalysisResponseSchema } from "./gateway/flowOutputSchemas";
import {
  fallbackChatReplanResponse,
  fallbackLiveDecisionSupportResponse,
  fallbackPostTripAnalysisResponse,
} from "./gateway/flowFallbacks";
import { runGatewayStructuredRequest } from "./gateway/runGatewayStructuredRequest";

interface GatewayRequest<TPayload> {
  flow: AiFlow;
  payload: TPayload;
}

const defaultAiGatewayUrl = import.meta.env.DEV
  ? `https://us-central1-${firebaseProjectId}.cloudfunctions.net/aiGateway`
  : "/api/ai";

const aiGatewayUrl = import.meta.env.VITE_AI_GATEWAY_URL ?? defaultAiGatewayUrl;
const directFunctionGatewayUrl = firebaseProjectId ? `https://us-central1-${firebaseProjectId}.cloudfunctions.net/aiGateway` : null;

const uniqueGatewayUrls = (): string[] => {
  const seen = new Set<string>();
  return [aiGatewayUrl, directFunctionGatewayUrl]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

interface RepairSchema<TResponse> {
  safeParse: (value: unknown) => SafeParseReturnType<unknown, TResponse>;
}

const parseWithRepair = <TResponse>(
  value: unknown,
  schema: RepairSchema<TResponse>,
  repair: (raw: unknown) => unknown,
  label: string,
  meta: { flow: AiFlow; endpoint: string },
): TResponse => {
  const repaired = repair(value);
  const parsed = schema.safeParse(repaired);
  if (parsed.success) {
    return parsed.data;
  }

  throw buildAiValidationError(label, parsed.error.issues, { flow: meta.flow, endpoint: meta.endpoint });
};

const postGateway = async <TResponse>(path: string, body: GatewayRequest<unknown>, parse: (value: unknown) => TResponse): Promise<TResponse> => {
  const gatewayUrls = uniqueGatewayUrls();
  const flow = body.flow;
  const endpoint = path;

  if (gatewayUrls.length === 0) {
    throw new ProviderUnavailableError("AI gateway URL is not configured.", { flow, endpoint, providerName: "aiGateway" });
  }

  const token = await firebaseAuth.currentUser?.getIdToken();
  if (!token) {
    throw new AiGatewayError("Authentication is required for AI requests.", { flow, endpoint, statusCode: 401, providerName: "firebaseAuth" });
  }

  let lastError: Error | null = null;

  for (const gatewayUrl of gatewayUrls) {
    try {
      const response = await fetch(`${gatewayUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody: unknown = await response.json().catch(() => null);
        const message =
          typeof errorBody === "object" && errorBody !== null && "error" in errorBody && typeof errorBody.error === "string"
            ? errorBody.error
            : "WanderMint could not reach its planning engine. Please try again in a moment.";

        if (response.status === 401 || response.status === 403) {
          throw new AiGatewayError(message, { flow, endpoint, statusCode: response.status, providerName: "aiGateway" });
        }

        lastError = new AiGatewayError(message, { flow, endpoint, statusCode: response.status, providerName: "aiGateway" });
        continue;
      }

      const json: unknown = await response.json();
      return parse(json);
    } catch (error) {
      if (error instanceof AiGatewayError || error instanceof ProviderUnavailableError || error instanceof AiValidationError) {
        throw error;
      }
      lastError =
        error instanceof Error
          ? new AiGatewayError(error.message, { flow, endpoint, providerName: "aiGateway" })
          : new AiGatewayError("AI gateway request failed", { flow, endpoint, providerName: "aiGateway" });
    }
  }

  throw lastError ?? new AiGatewayError("AI gateway request failed", { flow, endpoint, providerName: "aiGateway" });
};

export const openAiGatewayClient = {
  generateTripOptions: async (payload: unknown): Promise<GeneratedTripOptions> => {
    return runGatewayStructuredRequest<unknown, GeneratedTripOptions>({
      path: "/trip-options",
      flow: "trip_generation",
      payload,
      inputSchema: tripGenerationPayloadSchema,
      outputSchema: generatedTripOptionsSchema,
      repair: (raw, validated) => {
        const payload = validated as TripGenerationGatewayPayload;
        return normalizeGeneratedTripOptions(raw, payload.draft, payload.tripOptionPlan);
      },
      repairFailureLabel: "WanderMint could not repair those trip options into a usable structure.",
      throwOnPersistentOutputFailure: true,
    });
  },

  generateLocalScenarios: async (payload: unknown): Promise<GeneratedLocalScenarios> =>
    postGateway<GeneratedLocalScenarios>("/local-scenarios", { flow: "local_scenario", payload }, (value): GeneratedLocalScenarios =>
      parseWithRepair<GeneratedLocalScenarios>(
        value,
        generatedLocalScenariosSchema,
        (raw) =>
          normalizeGeneratedLocalScenarios(raw, {
            userId: (payload as { request?: { userId?: string } }).request?.userId,
            locationLabel: (payload as { request?: { locationLabel?: string } }).request?.locationLabel ?? "",
            availableMinutes: (payload as { request?: { availableMinutes?: number } }).request?.availableMinutes,
            exploreSpeed: (payload as { request?: { userPreferences?: UserPreferences | null } }).request?.userPreferences?.rightNowExploreSpeed,
          }),
        "WanderMint could not repair those local scenarios into a usable structure.",
        { flow: "local_scenario", endpoint: "/local-scenarios" },
      )),

  reviseTripFromChat: async (payload: unknown): Promise<ChatReplanResponse> =>
    runGatewayStructuredRequest<unknown, ChatReplanResponse>({
      path: "/trip-chat",
      flow: "trip_chat_replan",
      payload,
      inputSchema: tripChatReplanPayloadSchema,
      outputSchema: chatReplanResponseSchema,
      repair: (raw) => normalizeChatReplanResponse(raw),
      repairFailureLabel: "WanderMint could not repair that planning response.",
      buildFallback: fallbackChatReplanResponse,
    }),

  reasonAboutTripRevalidation: async (payload: unknown): Promise<ChatReplanResponse> =>
    runGatewayStructuredRequest<unknown, ChatReplanResponse>({
      path: "/trip-revalidation",
      flow: "trip_revalidation",
      payload,
      inputSchema: tripRevalidationPayloadSchema,
      outputSchema: chatReplanResponseSchema,
      repair: (raw) => normalizeChatReplanResponse(raw),
      repairFailureLabel: "WanderMint could not repair that revalidation response.",
      buildFallback: fallbackChatReplanResponse,
    }),

  recoverUnfinishedDay: async (payload: unknown): Promise<ChatReplanResponse> =>
    runGatewayStructuredRequest<unknown, ChatReplanResponse>({
      path: "/unfinished-day-recovery",
      flow: "unfinished_day_recovery",
      payload,
      inputSchema: unfinishedDayRecoveryPayloadSchema,
      outputSchema: chatReplanResponseSchema,
      repair: (raw) => normalizeChatReplanResponse(raw),
      repairFailureLabel: "WanderMint could not repair that recovery response.",
      buildFallback: fallbackChatReplanResponse,
    }),

  suggestPreferenceLearning: async (payload: unknown): Promise<ChatReplanResponse> =>
    runGatewayStructuredRequest<unknown, ChatReplanResponse>({
      path: "/preference-learning",
      flow: "preference_learning",
      payload,
      inputSchema: preferenceLearningPayloadSchema,
      outputSchema: chatReplanResponseSchema,
      repair: (raw) => normalizeChatReplanResponse(raw),
      repairFailureLabel: "WanderMint could not repair that learning response.",
      buildFallback: fallbackChatReplanResponse,
    }),

  analyzePostTrip: async (payload: unknown): Promise<PostTripAnalysisResponse> =>
    runGatewayStructuredRequest<unknown, PostTripAnalysisResponse>({
      path: "/post-trip-analysis",
      flow: "post_trip_analysis",
      payload,
      inputSchema: postTripAnalysisPayloadSchema,
      outputSchema: postTripAnalysisResponseSchema,
      repair: (raw) => raw,
      repairFailureLabel: "WanderMint could not parse post-trip analysis.",
      buildFallback: fallbackPostTripAnalysisResponse,
    }),

  supportLiveDecision: async (payload: unknown): Promise<LiveDecisionSupportResponse> =>
    runGatewayStructuredRequest<unknown, LiveDecisionSupportResponse>({
      path: "/live-decision-support",
      flow: "live_decision_support",
      payload,
      inputSchema: liveDecisionSupportPayloadSchema,
      outputSchema: liveDecisionSupportResponseSchema,
      repair: (raw) => raw,
      repairFailureLabel: "WanderMint could not parse live decision support.",
      buildFallback: fallbackLiveDecisionSupportResponse,
    }),

  reviseLocalScenarioFromChat: async (payload: unknown): Promise<LocalScenarioChatResponse> =>
    postGateway<LocalScenarioChatResponse>(
      "/local-scenario-chat",
      { flow: "local_scenario_chat", payload },
      (value): LocalScenarioChatResponse =>
        parseWithRepair<LocalScenarioChatResponse>(
          value,
          localScenarioChatResponseSchema,
          (raw) => {
            const normalized = normalizeLocalScenarioChatResponse(raw, {
              userId: (payload as { scenario?: { userId?: string } }).scenario?.userId,
              locationLabel: (payload as { scenario?: { locationLabel?: string } }).scenario?.locationLabel ?? "",
              availableMinutes: (payload as { scenario?: { estimatedDurationMinutes?: number } }).scenario?.estimatedDurationMinutes,
              exploreSpeed: (payload as { userPreferences?: UserPreferences | null }).userPreferences?.rightNowExploreSpeed,
            });
            const id = (payload as { scenario?: { id?: string } }).scenario?.id;
            if (normalized.updatedScenario && id) {
              return { ...normalized, updatedScenario: { ...normalized.updatedScenario, id } };
            }
            return normalized;
          },
          "WanderMint could not repair that right-now chat response.",
          { flow: "local_scenario_chat", endpoint: "/local-scenario-chat" },
        ),
    ),
};
