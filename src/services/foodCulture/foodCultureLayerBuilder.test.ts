import { describe, expect, it } from "vitest";
import { mergeFoodDrinkPlannerSettings } from "./foodCultureDefaults";
import { buildFoodCultureLayer } from "./foodCultureLayerBuilder";

describe("buildFoodCultureLayer", () => {
  it("prioritizes Kilkenny Smithwicks signal over generic Ireland", () => {
    const layer = buildFoodCultureLayer({
      city: "Kilkenny",
      country: "Ireland",
      planner: mergeFoodDrinkPlannerSettings({ primaryFoodDrinkStrategy: "local_authentic" }),
    });
    const drinkLabels = layer.mustTryDrinks.map((d) => d.label.toLowerCase());
    expect(drinkLabels.some((d) => d.includes("smithwick"))).toBe(true);
  });

  it("returns cautious summary when no knowledge matches", () => {
    const layer = buildFoodCultureLayer({
      city: "Unknownville",
      country: "Nowhereland",
      planner: mergeFoodDrinkPlannerSettings(undefined),
    });
    expect(layer.insights.length).toBe(0);
    expect(layer.summary.toLowerCase()).toContain("grounded");
  });
});
