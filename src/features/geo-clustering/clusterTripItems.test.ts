import { describe, expect, it } from "vitest";
import { buildClusterEfficiencyWarnings, buildGeoClustersFromItems, haversineMeters } from "./clusterTripItems";
import type { TripPlanItem } from "../trip-planning/timeline/timeline.types";

describe("buildGeoClustersFromItems", () => {
  it("groups transitively within linkage (deterministic ids)", () => {
    const items = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 0.0005, lng: 0 },
      { id: "c", lat: 10, lng: 10 },
    ];
    const clusters = buildGeoClustersFromItems(items, { linkageMeters: 120 });
    expect(clusters).toHaveLength(2);
    const withA = clusters.find((c) => c.itemIds.includes("a"));
    expect([...(withA?.itemIds ?? [])].sort()).toEqual(["a", "b"]);
    expect(clusters.some((c) => c.itemIds.includes("c") && c.itemIds.length === 1)).toBe(true);
  });

  it("computes centroid and walking radius", () => {
    const items = [
      { id: "x", lat: 0, lng: 0 },
      { id: "y", lat: 0, lng: 0.003 },
    ];
    const [c] = buildGeoClustersFromItems(items, { linkageMeters: 500 });
    expect(c!.estimatedWalkingRadiusMeters).toBeGreaterThan(0);
    expect(c!.center.lat).toBeCloseTo(0, 5);
  });
});

describe("buildClusterEfficiencyWarnings", () => {
  const tItem = (o: Partial<TripPlanItem> & Pick<TripPlanItem, "id">): TripPlanItem => ({
    title: "S",
    type: "activity",
    estimatedDurationMinutes: 60,
    travelTimeFromPreviousMinutes: 10,
    plannedStartTime: "09:00",
    plannedEndTime: "10:00",
    ...o,
  });

  it("warns on long cross-area legs when coordinates exist", () => {
    const items: TripPlanItem[] = [
      tItem({
        id: "p1",
        plannedStartTime: "09:00",
        plannedEndTime: "10:00",
        latitude: 38.72,
        longitude: -9.14,
      }),
      tItem({
        id: "p2",
        plannedStartTime: "10:30",
        plannedEndTime: "11:30",
        latitude: 38.9,
        longitude: -9.5,
      }),
    ];
    const w = buildClusterEfficiencyWarnings(items, { longJumpMeters: 800 });
    expect(w.some((x) => x.type === "cluster_long_jump")).toBe(true);
  });

  it("returns no warnings without coordinates", () => {
    const items: TripPlanItem[] = [
      tItem({ id: "a", plannedStartTime: "09:00", plannedEndTime: "10:00" }),
      tItem({ id: "b", plannedStartTime: "10:30", plannedEndTime: "11:30" }),
    ];
    expect(buildClusterEfficiencyWarnings(items)).toHaveLength(0);
  });
});

describe("haversineMeters", () => {
  it("is ~0 for identical points", () => {
    expect(haversineMeters(1, 2, 1, 2)).toBe(0);
  });
});
