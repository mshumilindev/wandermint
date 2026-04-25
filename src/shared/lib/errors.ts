import type { ZodIssue } from "zod";
import {
  AiGatewayError,
  AiValidationError,
  NotEnoughGroundedDataError,
  ProviderUnavailableError,
  zodIssuesToPaths,
} from "./appErrors";

const isDev = import.meta.env.DEV;

export const getErrorDevDetails = (error: unknown): string | undefined => {
  if (!isDev || !error) {
    return undefined;
  }

  if (error instanceof AiGatewayError) {
    const { flow, endpoint, statusCode, providerName } = error.context;
    return ["AiGatewayError", flow && `flow=${flow}`, endpoint && `endpoint=${endpoint}`, statusCode != null && `status=${statusCode}`, providerName && `provider=${providerName}`]
      .filter(Boolean)
      .join(" · ");
  }

  if (error instanceof AiValidationError) {
    const { flow, endpoint, zodPaths, issues } = error.context;
    const paths = zodPaths?.length ? zodPaths.join(", ") : issues ? zodIssuesToPaths(issues).join(", ") : "";
    return ["AiValidationError", flow && `flow=${flow}`, endpoint && `endpoint=${endpoint}`, paths && `zod=${paths}`].filter(Boolean).join(" · ");
  }

  if (error instanceof ProviderUnavailableError) {
    const { flow, providerName, endpoint } = error.context;
    return ["ProviderUnavailableError", flow && `flow=${flow}`, providerName && `provider=${providerName}`, endpoint && `endpoint=${endpoint}`].filter(Boolean).join(" · ");
  }

  if (error instanceof NotEnoughGroundedDataError) {
    const { flow, providerName } = error.context;
    return ["NotEnoughGroundedDataError", flow && `flow=${flow}`, providerName && `provider=${providerName}`].filter(Boolean).join(" · ");
  }

  if (error instanceof Error && error.message) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
};

/** `console.debug` in dev only — use from catch blocks for support. */
export const debugLogError = (label: string, error: unknown): void => {
  if (!isDev) {
    return;
  }

  const detail = getErrorDevDetails(error);
  // eslint-disable-next-line no-console -- intentional dev-only diagnostics
  console.debug(`[wandermint:${label}]`, error, detail ?? "");
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof AiGatewayError) {
    const status = error.context.statusCode;
    const msg = error.message.toLowerCase();
    if (status === 401 || status === 403 || msg.includes("authentication") || msg.includes("sign in")) {
      return "Please sign in again, then retry. If the problem continues, your session may have expired.";
    }
    if (msg.includes("openai") && (msg.includes("key") || msg.includes("api"))) {
      return "The planning service is not fully configured. Check the OpenAI / gateway setup, then try again.";
    }
    if (status === 429) {
      return "The planning service is busy. Wait a short moment and try again.";
    }
    if (status != null && status >= 500) {
      return "The planning service had a temporary problem. Try again in a minute.";
    }
    return "We could not reach the planning engine. Check your connection and try again.";
  }

  if (error instanceof AiValidationError) {
    return "The planner returned data we could not read. Try again; if it keeps happening, report it with the date and trip you used.";
  }

  if (error instanceof ProviderUnavailableError) {
    return "A data source (maps, weather, or places) was unavailable. Try again shortly.";
  }

  if (error instanceof NotEnoughGroundedDataError) {
    return "There was not enough nearby place data for this location. Try another area, refresh location, or widen your search.";
  }

  if (error instanceof Error && error.message.includes("Authentication")) {
    return "Please sign in again to continue.";
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "We could not complete that just now. Please try again.";
};

export const buildAiValidationError = (label: string, issues: ZodIssue[], context: { flow?: string; endpoint?: string } = {}): AiValidationError =>
  new AiValidationError(label, {
    ...context,
    issues,
    zodPaths: zodIssuesToPaths(issues),
  });
