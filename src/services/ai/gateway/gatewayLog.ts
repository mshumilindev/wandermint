import type { ZodIssue } from "zod";
import type { AiFlow } from "../../../shared/lib/appErrors";
import { zodIssuesToPaths } from "../../../shared/lib/appErrors";

export type GatewayLogPhase =
  | "request_rejected"
  | "request_accepted"
  | "response_invalid"
  | "response_retry_scheduled"
  | "response_fallback_used"
  | "response_ok";

/** Log gateway phases without payload bodies, user text, or coordinates. */
export const logGatewayEvent = (event: {
  phase: GatewayLogPhase;
  flow: AiFlow;
  endpoint: string;
  attempt: number;
  issueCodes?: string[];
  issuePaths?: string[];
  /** Counts / flags only — never log raw request or AI strings */
  meta?: Record<string, number | boolean | string | null | undefined>;
}): void => {
  const payload = {
    ...event,
    issuePaths: event.issuePaths?.slice(0, 40),
    issueCodes: event.issueCodes?.slice(0, 40),
  };
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional structured diagnostics (no PII)
    console.info("[ai-gateway]", payload);
  }
};

export const issuesToSafeLog = (issues: ZodIssue[]): { paths: string[]; codes: string[] } => ({
  paths: zodIssuesToPaths(issues).slice(0, 60),
  codes: issues.map((i) => i.code).slice(0, 60),
});

export const summarizeIssuesForModelRetry = (issues: ZodIssue[]): string =>
  issues
    .slice(0, 48)
    .map((i) => `${i.path.length ? i.path.join(".") : "root"}:${i.code}`)
    .join("; ");
