const PKCE_VERIFIER_KEY = "wandermint.spotify.pkce.verifier";
const PKCE_STATE_KEY = "wandermint.spotify.pkce.state";

/** Short-lived Spotify access token — memory first, optional sessionStorage fallback. */
let spotifyAccessTokenMemory: string | null = null;

export const musicTokenStorage = {
  setPkceVerifier: (verifier: string): void => {
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  },

  getPkceVerifier: (): string | null => sessionStorage.getItem(PKCE_VERIFIER_KEY),

  clearPkceVerifier: (): void => {
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  },

  setPkceState: (state: string): void => {
    sessionStorage.setItem(PKCE_STATE_KEY, state);
  },

  getPkceState: (): string | null => sessionStorage.getItem(PKCE_STATE_KEY),

  clearPkceState: (): void => {
    sessionStorage.removeItem(PKCE_STATE_KEY);
  },

  setSpotifyAccessToken: (token: string | null, persistSession: boolean): void => {
    spotifyAccessTokenMemory = token;
    if (persistSession && token) {
      sessionStorage.setItem("wandermint.spotify.access", token);
    }
    if (!token) {
      sessionStorage.removeItem("wandermint.spotify.access");
    }
  },

  getSpotifyAccessToken: (): string | null => spotifyAccessTokenMemory ?? sessionStorage.getItem("wandermint.spotify.access"),

  clearSpotifyAccessToken: (): void => {
    spotifyAccessTokenMemory = null;
    sessionStorage.removeItem("wandermint.spotify.access");
  },
};
