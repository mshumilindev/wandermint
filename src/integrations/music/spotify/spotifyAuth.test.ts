import { describe, expect, it } from "vitest";
import { generateSpotifyOAuthState, generateSpotifyPkcePair } from "./spotifyAuth";

describe("spotifyAuth PKCE", () => {
  it("generates verifier within PKCE length bounds", async () => {
    const { verifier } = await generateSpotifyPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("generates base64url challenge without padding", async () => {
    const { challenge } = await generateSpotifyPkcePair();
    expect(challenge).not.toContain("+");
    expect(challenge).not.toContain("/");
    expect(challenge).not.toContain("=");
  });

  it("generates state token", () => {
    const a = generateSpotifyOAuthState();
    const b = generateSpotifyOAuthState();
    expect(a.length).toBeGreaterThan(8);
    expect(a).not.toEqual(b);
  });
});
