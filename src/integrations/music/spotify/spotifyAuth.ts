import { MusicIntegrationError } from "../musicErrors";
import { musicTokenStorage } from "../musicTokenStorage";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

const randomVerifier = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i]! % CHARSET.length]!;
  }
  return out;
};

const base64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const generateSpotifyPkcePair = async (): Promise<{ verifier: string; challenge: string }> => {
  const verifier = randomVerifier(64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(digest) };
};

export const generateSpotifyOAuthState = (): string => base64Url(crypto.getRandomValues(new Uint8Array(16)).buffer);

export const buildSpotifyAuthorizeUrl = (params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string => {
  const u = new URL("https://accounts.spotify.com/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("scope", "user-top-read user-read-recently-played");
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("state", params.state);
  return u.toString();
};

export const exchangeSpotifyAuthorizationCode = async (params: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> => {
  const body = new URLSearchParams({
    client_id: params.clientId,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new MusicIntegrationError("token_exchange_failed", "Spotify token exchange failed");
  }
  const json: unknown = await res.json();
  if (!json || typeof json !== "object") {
    throw new MusicIntegrationError("token_exchange_failed", "Invalid token response");
  }
  const rec = json as Record<string, unknown>;
  const access = typeof rec.access_token === "string" ? rec.access_token : "";
  const expiresIn = typeof rec.expires_in === "number" ? rec.expires_in : 3600;
  const refresh = typeof rec.refresh_token === "string" ? rec.refresh_token : undefined;
  if (!access) {
    throw new MusicIntegrationError("token_exchange_failed", "Missing access_token");
  }
  /**
   * TODO: Move refresh token + exchange to Firebase Callable (`musicSpotifyExchangeCode`) with
   * Spotify client secret in Secret Manager — SPA PKCE cannot securely persist refresh tokens long-term.
   */
  return { access_token: access, expires_in: expiresIn, refresh_token: refresh };
};

export const beginSpotifyPkceLogin = async (redirectUri: string): Promise<void> => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  if (!clientId?.trim()) {
    throw new MusicIntegrationError("provider_unavailable", "Spotify client id is not configured");
  }
  const { verifier, challenge } = await generateSpotifyPkcePair();
  const state = generateSpotifyOAuthState();
  musicTokenStorage.setPkceVerifier(verifier);
  musicTokenStorage.setPkceState(state);
  const url = buildSpotifyAuthorizeUrl({ clientId, redirectUri, codeChallenge: challenge, state });
  window.location.assign(url);
};
