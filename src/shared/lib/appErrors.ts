import type { ZodIssue } from "zod";

export type AiFlow =
  | "trip_generation"
  | "local_scenario"
  | "local_scenario_chat"
  | "trip_chat_replan"
  | "trip_revalidation"
  | "unfinished_day_recovery"
  | "preference_learning"
  | "post_trip_analysis"
  | "live_decision_support";

export interface AppErrorContext {
  flow?: AiFlow | string;
  endpoint?: string;
  zodPaths?: string[];
  providerName?: string;
  statusCode?: number;
}

const setProto = <T extends Error>(instance: T, ctor: abstract new (...args: never[]) => Error): T => {
  Object.setPrototypeOf(instance, ctor.prototype);
  return instance;
};

/** Upstream AI gateway / HTTP failures (missing key, 5xx, network, etc.). */
export class AiGatewayError extends Error {
  readonly code = "AI_GATEWAY" as const;

  readonly context: AppErrorContext;

  constructor(message: string, context: AppErrorContext = {}) {
    super(message);
    this.name = "AiGatewayError";
    this.context = context;
    return setProto(this, AiGatewayError);
  }
}

/** Zod / structural validation of AI or provider payloads failed. */
export class AiValidationError extends Error {
  readonly code = "AI_VALIDATION" as const;

  readonly context: AppErrorContext & { issues?: ZodIssue[] };

  constructor(message: string, context: AppErrorContext & { issues?: ZodIssue[] } = {}) {
    super(message);
    this.name = "AiValidationError";
    this.context = context;
    return setProto(this, AiValidationError);
  }
}

/** Public data provider unreachable or returned unusable data. */
export class ProviderUnavailableError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE" as const;

  readonly context: AppErrorContext;

  constructor(message: string, context: AppErrorContext = {}) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.context = context;
    return setProto(this, ProviderUnavailableError);
  }
}

/** Not enough grounded places / signals to safely call AI or build scenarios. */
export class NotEnoughGroundedDataError extends Error {
  readonly code = "NOT_ENOUGH_GROUNDED_DATA" as const;

  readonly context: AppErrorContext;

  constructor(message: string, context: AppErrorContext = {}) {
    super(message);
    this.name = "NotEnoughGroundedDataError";
    this.context = context;
    return setProto(this, NotEnoughGroundedDataError);
  }
}

export const isAppError = (error: unknown): error is AiGatewayError | AiValidationError | ProviderUnavailableError | NotEnoughGroundedDataError =>
  error instanceof AiGatewayError ||
  error instanceof AiValidationError ||
  error instanceof ProviderUnavailableError ||
  error instanceof NotEnoughGroundedDataError;

export const zodIssuesToPaths = (issues: ZodIssue[]): string[] =>
  issues.map((issue) => (issue.path.length ? issue.path.map(String).join(".") : "root"));
