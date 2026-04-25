import { describe, expect, it } from "vitest";
import { getAirportByIata } from "./airportCatalog";
import { arrivalAirportToCityRange, estimateSurfaceLegMinutes, haversineKm } from "./flightGeo";

describe("haversineKm", () => {
  it("IST to SAW is tens of km apart", () => {
    const ist = getAirportByIata("IST")!;
    const saw = getAirportByIata("SAW")!;
    const km = haversineKm(ist.coordinates, saw.coordinates);
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(70);
  });
});

describe("estimateSurfaceLegMinutes", () => {
  it("separates intra-metro hops from long cross-border legs", () => {
    const ist = getAirportByIata("IST")!;
    const saw = getAirportByIata("SAW")!;
    const lhr = getAirportByIata("LHR")!;
    const metroHop = estimateSurfaceLegMinutes(ist, saw);
    const longLeg = estimateSurfaceLegMinutes(ist, lhr);
    expect(longLeg - metroHop).toBeGreaterThan(80);
  });
});

describe("arrivalAirportToCityRange", () => {
  it("reports a band for Istanbul metro", () => {
    const saw = getAirportByIata("SAW")!;
    const r = arrivalAirportToCityRange(saw, "Istanbul");
    expect(r.min).toBeGreaterThan(0);
    expect(r.max).toBeGreaterThanOrEqual(r.min);
    expect(r.note.toLowerCase()).toContain("ist");
  });
});
