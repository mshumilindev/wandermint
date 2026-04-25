import type { MusicProvider } from "./musicTypes";

export type MusicIntegrationErrorCode =
  | "oauth_cancelled"
  | "oauth_state_mismatch"
  | "missing_code_verifier"
  | "token_exchange_failed"
  | "provider_unauthorized"
  | "provider_forbidden"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "profile_parse_failed"
  | "unsupported_provider"
  | "event_provider_unavailable";

export class MusicIntegrationError extends Error {
  readonly code: MusicIntegrationErrorCode;

  readonly provider?: MusicProvider;

  constructor(code: MusicIntegrationErrorCode, message: string, provider?: MusicProvider) {
    super(message);
    this.name = "MusicIntegrationError";
    this.code = code;
    this.provider = provider;
    Object.setPrototypeOf(this, MusicIntegrationError.prototype);
  }
}

export const musicErrorUserMessage = (code: MusicIntegrationErrorCode): string => {
  switch (code) {
    case "oauth_cancelled":
      return "Connection was cancelled.";
    case "oauth_state_mismatch":
      return "Connection could not be verified. Please try connecting again.";
    case "missing_code_verifier":
      return "Session expired before finishing sign-in. Please try again.";
    case "token_exchange_failed":
      return "Could not complete sign-in with the music service.";
    case "provider_unauthorized":
      return "Please reconnect this service.";
    case "provider_forbidden":
      return "This service refused access. Check granted permissions and try again.";
    case "provider_rate_limited":
      return "This service is temporarily limiting requests. Try again later.";
    case "provider_unavailable":
      return "Music service is unavailable right now.";
    case "profile_parse_failed":
      return "We synced your account, but couldn't read enough music signals yet.";
    case "unsupported_provider":
      return "This service is not supported yet.";
    case "event_provider_unavailable":
      return "Concert search is not available right now.";
    default:
      return "Something went wrong with music integration.";
  }
};

export const warnMusicDev = (code: MusicIntegrationErrorCode, provider?: MusicProvider, detail?: string): void => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[music]", code, provider ?? "", detail ?? "");
  }
};
