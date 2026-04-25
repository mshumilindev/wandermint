import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { clearTransportTimeCacheForTests } from "./transportCache";
import { estimateTransportTimeSync, haversineDistanceKm, resolveTransportTime } from "./transportTimeResolver";

afterEach(() => {
  clearTransportTimeCacheForTests();
});

describe("haversineDistanceKm", () => {
  it("returns ~0 for identical points", () => {
    const p = { lat: 52.23, lng: 21.01 };
    expect(haversineDistanceKm(p, p)).toBeLessThan(1e-6);
  });

  it("returns a plausible distance for Warsaw city span", () => {
    const a = { lat: 52.2297, lng: 21.0122 };
    const b = { lat: 52.2477, lng: 21.0134 };
    const km = haversineDistanceKm(a, b);
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(5);
  });
});

describe("estimateTransportTimeSync", () => {
  it("uses walking 5 km/h for deterministic fallback", () => {
    const a = { lat: 52.23, lng: 21.01 };
    const b = { lat: 52.24, lng: 21.02 };
    const r = estimateTransportTimeSync({ from: a, to: b, mode: "walking" });
    expect(r.source).toBe("estimated");
    expect(r.confidence).toBe("low");
    expect(r.durationMinutes).toBeGreaterThanOrEqual(1);
  });

  it("uses 18 km/h for transit fallback", () => {
    const a = { lat: 52.23, lng: 21.01 };
    const b = { lat: 52.24, lng: 21.02 };
    const walk = estimateTransportTimeSync({ from: a, to: b, mode: "walking" });
    const transit = estimateTransportTimeSync({ from: a, to: b, mode: "transit" });
    expect(transit.durationMinutes).toBeLessThanOrEqual(walk.durationMinutes);
  });
});

describe("resolveTransportTime (OSRM mocked offline)", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      })),
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("uses deterministic fallback when routing fails and caches the result", async () => {
    const req = { from: { lat: 40.7128, lng: -74.006 }, to: { lat: 40.72, lng: -74.01 }, mode: "walking" as const };
    const first = await resolveTransportTime(req);
    const second = await resolveTransportTime(req);
    expect(first.source).toBe("estimated");
    expect(first.confidence).toBe("low");
    expect(second.source).toBe("cached");
    expect(second.durationMinutes).toBe(first.durationMinutes);
  });
});
