import { afterEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "./analyticsEvents";
import { logAnalyticsEvent, registerAnalyticsSink, sanitizeAnalyticsMeta, setAnalyticsLocationConsentProvider } from "./appLogger";

describe("appLogger", () => {
  afterEach(() => {
    setAnalyticsLocationConsentProvider(() => false);
  });

  it("does not throw when a sink throws", async () => {
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error("sink boom");
    });
    const unsubBad = registerAnalyticsSink(bad);
    const unsubGood = registerAnalyticsSink(good);
    expect(() =>
      logAnalyticsEvent(ANALYTICS_EVENTS.ai_flow_failed, {
        errorKind: "TestError",
      }),
    ).not.toThrow();
    await vi.waitFor(() => expect(good).toHaveBeenCalled());
    unsubBad();
    unsubGood();
  });

  it("strips precise coordinates unless consent is granted", () => {
    setAnalyticsLocationConsentProvider(() => false);
    const redacted = sanitizeAnalyticsMeta({ tripId: "t1", latitude: 1.23, nested: { lng: 4.56 } }, false);
    expect(redacted).toEqual({ tripId: "t1", nested: {} });

    setAnalyticsLocationConsentProvider(() => true);
    const kept = sanitizeAnalyticsMeta({ tripId: "t1", latitude: 1.23 }, true);
    expect(kept).toEqual({ tripId: "t1", latitude: 1.23 });
  });
});
