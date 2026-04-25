import { describe, expect, it } from "vitest";
import type { AnchorEvent } from "../../entities/trip/model";
import { anchorEventToTripEvent, formatStructuredTripEventsForPrompt } from "./tripEventTypes";

const baseAnchor = (): AnchorEvent => ({
  id: "e1",
  type: "concert",
  title: "Band at Arena",
  city: "Dublin",
  country: "Ireland",
  venue: "Arena",
  startAt: "2026-06-01T20:00:00.000Z",
  endAt: "2026-06-01T23:00:00.000Z",
  locked: true,
  ticketStatus: "booked",
  genreTags: [],
  provider: "manual",
});

describe("anchorEventToTripEvent", () => {
  it("marks manual anchors as custom", () => {
    const te = anchorEventToTripEvent(baseAnchor());
    expect(te.mode).toBe("custom");
    expect(te.venue?.name).toBe("Arena");
  });

  it("marks catalog anchors as resolved when provider id exists", () => {
    const te = anchorEventToTripEvent({
      ...baseAnchor(),
      provider: "ticketmaster",
      providerEventId: "abc123",
      latitude: 53.35,
      longitude: -6.26,
    });
    expect(te.mode).toBe("resolved");
    expect(te.coordinates).toEqual({ lat: 53.35, lng: -6.26 });
  });
});

describe("formatStructuredTripEventsForPrompt", () => {
  it("includes coordinates when set", () => {
    const text = formatStructuredTripEventsForPrompt([
      {
        ...baseAnchor(),
        provider: "ticketmaster",
        providerEventId: "x",
        latitude: 53.35,
        longitude: -6.26,
      },
    ]);
    expect(text).toContain("53.35000");
    expect(text).toContain("-6.26000");
  });
});
