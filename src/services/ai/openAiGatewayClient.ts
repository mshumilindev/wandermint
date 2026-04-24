import type { SafeParseReturnType } from "zod";
import { normalizeChatReplanResponse, normalizeGeneratedLocalScenarios, normalizeGeneratedTripOptions } from "./aiResponseRepair";
import { chatReplanResponseSchema, generatedLocalScenariosSchema, generatedTripOptionsSchema, type ChatReplanResponse, type GeneratedLocalScenarios, type GeneratedTripOptions } from "./schemas";
import { firebaseAuth, firebaseProjectId } from "../firebase/firebaseApp";
import type { Trip } from "../../entities/trip/model";

interface TripDraftPayload {
  draft?: {
    userId: string;
    destination: string;
    tripSegments: Trip["tripSegments"];
    dateRange: Trip["dateRange"];
    flightInfo: Trip["flightInfo"];
    hotelInfo: Trip["hotelInfo"];
    budget: Trip["budget"];
    preferences: Trip["preferences"];
    executionProfile: NonNullable<Trip["executionProfile"]>;
    anchorEvents: NonNullable<Trip["anchorEvents"]>;
  };
}

interface GatewayRequest<TPayload> {
  flow: "trip_generation" | "local_scenario" | "trip_chat_replan" | "trip_revalidation" | "unfinished_day_recovery" | "preference_learning";
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

const schemaErrorMessage = (label: string, issues: Array<{ path: (string | number)[]; message: string }>): Error => {
  const details = issues.slice(0, 6).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join(" | ");
  return new Error(import.meta.env.DEV ? `${label}. ${details}` : label);
};

interface RepairSchema<TResponse> {
  safeParse: (value: unknown) => SafeParseReturnType<unknown, TResponse>;
}

const parseWithRepair = <TResponse>(
  value: unknown,
  schema: RepairSchema<TResponse>,
  repair: (raw: unknown) => unknown,
  label: string,
): TResponse => {
  const repaired = repair(value);
  const parsed = schema.safeParse(repaired);
  if (parsed.success) {
    return parsed.data;
  }

  throw schemaErrorMessage(label, parsed.error.issues);
};

const postGateway = async <TResponse>(path: string, body: GatewayRequest<unknown>, parse: (value: unknown) => TResponse): Promise<TResponse> => {
  const gatewayUrls = uniqueGatewayUrls();
  if (gatewayUrls.length === 0) {
    throw new Error("AI gateway URL is not configured");
  }

  const token = await firebaseAuth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("Authentication is required for AI requests");
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
        const message = typeof errorBody === "object" && errorBody !== null && "error" in errorBody && typeof errorBody.error === "string"
          ? errorBody.error
          : "WanderMint could not reach its planning engine. Please try again in a moment.";

        if (response.status === 401 || response.status === 403) {
          throw new Error(message);
        }

        lastError = new Error(message);
        continue;
      }

      const json: unknown = await response.json();
      return parse(json);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("AI gateway request failed");
    }
  }

  throw lastError ?? new Error("AI gateway request failed");
};

export const openAiGatewayClient = {
  generateTripOptions: async (payload: unknown): Promise<GeneratedTripOptions> =>
    postGateway<GeneratedTripOptions>("/trip-options", { flow: "trip_generation", payload }, (value): GeneratedTripOptions =>
      parseWithRepair<GeneratedTripOptions>(
        value,
        generatedTripOptionsSchema,
        (raw) => normalizeGeneratedTripOptions(raw, ((payload as TripDraftPayload).draft ?? payload) as NonNullable<TripDraftPayload["draft"]>),
        "WanderMint could not repair those trip options into a usable structure.",
      )),

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
          }),
        "WanderMint could not repair those local scenarios into a usable structure.",
      )),

  reviseTripFromChat: async (payload: unknown): Promise<ChatReplanResponse> =>
    postGateway<ChatReplanResponse>("/trip-chat", { flow: "trip_chat_replan", payload }, (value): ChatReplanResponse =>
      parseWithRepair<ChatReplanResponse>(
        value,
        chatReplanResponseSchema,
        normalizeChatReplanResponse,
        "WanderMint could not repair that planning response.",
      )),

  reasonAboutTripRevalidation: async (payload: unknown): Promise<ChatReplanResponse> =>
    postGateway<ChatReplanResponse>("/trip-revalidation", { flow: "trip_revalidation", payload }, (value): ChatReplanResponse =>
      parseWithRepair<ChatReplanResponse>(
        value,
        chatReplanResponseSchema,
        normalizeChatReplanResponse,
        "WanderMint could not repair that revalidation response.",
      )),

  recoverUnfinishedDay: async (payload: unknown): Promise<ChatReplanResponse> =>
    postGateway<ChatReplanResponse>("/unfinished-day-recovery", { flow: "unfinished_day_recovery", payload }, (value): ChatReplanResponse =>
      parseWithRepair<ChatReplanResponse>(
        value,
        chatReplanResponseSchema,
        normalizeChatReplanResponse,
        "WanderMint could not repair that recovery response.",
      )),

  suggestPreferenceLearning: async (payload: unknown): Promise<ChatReplanResponse> =>
    postGateway<ChatReplanResponse>("/preference-learning", { flow: "preference_learning", payload }, (value): ChatReplanResponse =>
      parseWithRepair<ChatReplanResponse>(
        value,
        chatReplanResponseSchema,
        normalizeChatReplanResponse,
        "WanderMint could not repair that learning response.",
      )),
};
