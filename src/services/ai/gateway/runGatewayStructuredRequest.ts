import type { ZodIssue, ZodTypeAny } from "zod";
import type { AiFlow } from "../../../shared/lib/appErrors";
import { AiGatewayError, AiValidationError, ProviderUnavailableError } from "../../../shared/lib/appErrors";
import { buildAiValidationError } from "../../../shared/lib/errors";
import { firebaseAuth, firebaseProjectId } from "../../firebase/firebaseApp";
import { ANALYTICS_EVENTS } from "../../../features/observability/analyticsEvents";
import { logAnalyticsEvent } from "../../../features/observability/appLogger";
import { issuesToSafeLog, logGatewayEvent, summarizeIssuesForModelRetry } from "./gatewayLog";
import { gatewayRetryContextSchema } from "./flowPayloadSchemas";

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

interface GatewayRequestBody {
  flow: AiFlow;
  payload: unknown;
}

const requestRejectedMessage = "This planning request was rejected because it did not match the expected shape.";

const safeMetaForFlow = (flow: AiFlow, payload: Record<string, unknown>): Record<string, number | boolean | string | null | undefined> => {
  switch (flow) {
    case "trip_generation": {
      const draft = payload.draft as Record<string, unknown> | undefined;
      return {
        hasDraft: Boolean(draft),
        promptLen: typeof payload.prompt === "string" ? payload.prompt.length : 0,
        forecastLen: Array.isArray(payload.forecast) ? payload.forecast.length : 0,
        placesLen: Array.isArray(payload.places) ? payload.places.length : 0,
        hasRetryContext: gatewayRetryContextSchema.safeParse(payload.gatewayRetryContext).success,
      };
    }
    case "trip_chat_replan":
      return {
        userRequestLen: typeof payload.userRequest === "string" ? payload.userRequest.length : 0,
        dayCount: Array.isArray(payload.days) ? payload.days.length : 0,
        messageCount: Array.isArray(payload.recentMessages) ? payload.recentMessages.length : 0,
        warningCount: Array.isArray(payload.warnings) ? payload.warnings.length : 0,
        hasRetryContext: gatewayRetryContextSchema.safeParse(payload.gatewayRetryContext).success,
      };
    case "trip_revalidation":
      return {
        dayCount: Array.isArray(payload.days) ? payload.days.length : 0,
        warningCount: Array.isArray(payload.warnings) ? payload.warnings.length : 0,
        hasRetryContext: gatewayRetryContextSchema.safeParse(payload.gatewayRetryContext).success,
      };
    case "unfinished_day_recovery":
      return {
        hasDay: Boolean(payload.day),
        hasRetryContext: gatewayRetryContextSchema.safeParse(payload.gatewayRetryContext).success,
      };
    case "preference_learning":
      return {
        hasSignalDigest: Boolean(payload.signalDigest),
        hasRetryContext: gatewayRetryContextSchema.safeParse(payload.gatewayRetryContext).success,
      };
    case "post_trip_analysis":
      return {
        hasReviewFacts: Boolean(payload.reviewFacts),
        hasRetryContext: gatewayRetryContextSchema.safeParse(payload.gatewayRetryContext).success,
      };
    case "live_decision_support":
      return {
        tripIdLen: typeof payload.tripId === "string" ? payload.tripId.length : 0,
        dayIdLen: typeof payload.dayId === "string" ? payload.dayId.length : 0,
        hasExecutionState: Boolean(payload.executionState),
        hasRetryContext: gatewayRetryContextSchema.safeParse(payload.gatewayRetryContext).success,
      };
    default:
      return {};
  }
};

const postGatewayJson = async (path: string, body: GatewayRequestBody): Promise<unknown> => {
  const gatewayUrls = uniqueGatewayUrls();
  const { flow } = body;
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

      return (await response.json()) as unknown;
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

export interface RunGatewayStructuredRequestParams<TIn, TOut> {
  path: string;
  flow: AiFlow;
  payload: unknown;
  /** ZodTypeAny avoids duplicate-zod inference clashes between packages. */
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  repair: (raw: unknown, validatedInput: TIn) => unknown;
  repairFailureLabel: string;
  buildFallback?: () => TOut;
  /** When true, invalid output after retry throws instead of returning fallback (unsafe to fabricate trips). */
  throwOnPersistentOutputFailure?: boolean;
}

export const runGatewayStructuredRequest = async <TIn, TOut>(params: RunGatewayStructuredRequestParams<TIn, TOut>): Promise<TOut> => {
  const { path, flow, payload, inputSchema, outputSchema, repair, repairFailureLabel, buildFallback, throwOnPersistentOutputFailure } = params;
  const endpoint = path;

  const inputParsed = inputSchema.safeParse(payload);
  if (!inputParsed.success) {
    const { paths, codes } = issuesToSafeLog(inputParsed.error.issues);
    logGatewayEvent({
      phase: "request_rejected",
      flow,
      endpoint,
      attempt: 0,
      issuePaths: paths,
      issueCodes: codes,
    });
    throw buildAiValidationError(requestRejectedMessage, inputParsed.error.issues, { flow, endpoint });
  }

  const validated = inputParsed.data as TIn;
  logGatewayEvent({
    phase: "request_accepted",
    flow,
    endpoint,
    attempt: 0,
    meta: safeMetaForFlow(flow, validated as unknown as Record<string, unknown>),
  });

  const tryParseOutput = (raw: unknown, attempt: number): { ok: true; value: TOut } | { ok: false; issues: ZodIssue[] } => {
    const repaired = repair(raw, validated);
    const parsed = outputSchema.safeParse(repaired);
    if (parsed.success) {
      return { ok: true, value: parsed.data as TOut };
    }
    const { paths, codes } = issuesToSafeLog(parsed.error.issues);
    logGatewayEvent({
      phase: "response_invalid",
      flow,
      endpoint,
      attempt,
      issuePaths: paths,
      issueCodes: codes,
    });
    logAnalyticsEvent(ANALYTICS_EVENTS.ai_response_invalid, {
      flow: String(flow),
      endpoint,
      attempt,
      issuePathCount: paths.length,
      issueCodeCount: codes.length,
      topIssuePaths: paths.slice(0, 12),
      topIssueCodes: codes.slice(0, 12),
    });
    return { ok: false, issues: parsed.error.issues };
  };

  const rawFirst = await postGatewayJson(path, { flow, payload: validated });
  const first = tryParseOutput(rawFirst, 1);
  if (first.ok) {
    logGatewayEvent({ phase: "response_ok", flow, endpoint, attempt: 1 });
    return first.value;
  }

  const retryPayload = {
    ...(validated as object),
    gatewayRetryContext: {
      validationIssueSummary: summarizeIssuesForModelRetry(first.issues),
      paths: issuesToSafeLog(first.issues).paths,
    },
  } as unknown as TIn;

  logGatewayEvent({
    phase: "response_retry_scheduled",
    flow,
    endpoint,
    attempt: 1,
    meta: { issueCount: first.issues.length },
  });

  const inputRetry = inputSchema.safeParse(retryPayload);
  if (!inputRetry.success) {
    if (throwOnPersistentOutputFailure) {
      throw buildAiValidationError(repairFailureLabel, inputRetry.error.issues, { flow, endpoint });
    }
    logGatewayEvent({ phase: "response_fallback_used", flow, endpoint, attempt: 2, meta: { reason: "retry_payload_invalid" } });
    if (!buildFallback) {
      throw buildAiValidationError(repairFailureLabel, inputRetry.error.issues, { flow, endpoint });
    }
    return buildFallback();
  }

  const rawSecond = await postGatewayJson(path, { flow, payload: inputRetry.data });
  const second = tryParseOutput(rawSecond, 2);
  if (second.ok) {
    logGatewayEvent({ phase: "response_ok", flow, endpoint, attempt: 2 });
    return second.value;
  }

  if (throwOnPersistentOutputFailure) {
    throw buildAiValidationError(repairFailureLabel, second.issues, { flow, endpoint });
  }

  logGatewayEvent({
    phase: "response_fallback_used",
    flow,
    endpoint,
    attempt: 2,
    meta: { issueCount: second.issues.length },
  });
  if (!buildFallback) {
    throw buildAiValidationError(repairFailureLabel, second.issues, { flow, endpoint });
  }
  return buildFallback();
};
