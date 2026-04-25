import type { FoodDrinkPlannerSettings, FoodDrinkStrategy } from "../../entities/food-culture/model";

const linesForStrategy = (s: FoodDrinkStrategy): string[] => {
  switch (s) {
    case "high_end":
      return [
        "HIGH-END FOOD: prioritize fine dining, tasting menus, omakase where culturally relevant, acclaimed wine/cocktail bars; fewer but stronger food moments.",
        "Include reservation pressure where culturally normal; avoid random casual venues unless culturally iconic.",
      ];
    case "local_authentic":
      return [
        "LOCAL & AUTHENTIC: prioritize traditional formats, regional specialties, markets, family-run spots; avoid generic international chains unless user comfort strategy.",
      ];
    case "not_tourist_trap":
      return [
        "ANTI-TOURIST-TRAP: avoid obvious overpriced landmark-adjacent tourist menus; prefer side streets, neighborhoods, markets, credible non-hyped spots.",
        "When a meal is unavoidably tourist-core, spell out the tradeoff instead of pretending it is a hidden gem.",
      ];
    case "street_food":
      return [
        "STREET / CASUAL: prioritize markets, stalls, casual counters, izakaya/tapas/pub formats where they fit; dense exploration OK with hygiene common sense.",
      ];
    case "budget_local":
      return [
        "BUDGET LOCAL: prioritize bakeries, markets, lunch menus, convenience-store culture where strong (e.g. Japan), casual tascas/delis; supermarket tips only if user toggled shop tips ON.",
      ];
    case "seafood_focus":
      return [
        "SEAFOOD FOCUS: bias seafood where the destination knowledge supports it; do not force seafood where it is not a strength or user dislikes seafood.",
      ];
    case "comfort_safe":
      return [
        "COMFORT / SAFE: favor approachable local classics; avoid overly experimental items unless clearly labeled optional.",
      ];
    case "experimental":
      return [
        "EXPERIMENTAL: include unusual local dishes/drinks when grounded; label clearly as adventurous; never imply medical safety or unsafe consumption.",
      ];
    case "balanced":
    default:
      return ["BALANCED FOOD: mix local classics with at most one stronger food/drink experience per day when pacing allows."];
  }
};

export const buildFoodStrategyBehaviorPrompt = (planner: FoodDrinkPlannerSettings): string[] => {
  const strategies: FoodDrinkStrategy[] = [planner.primaryFoodDrinkStrategy, ...planner.secondaryFoodDrinkStrategies];
  const unique = [...new Set(strategies)];
  const out: string[] = [];
  for (const s of unique) {
    out.push(...linesForStrategy(s));
  }
  if (!planner.includeAlcoholRecommendations) {
    out.push("ALCOHOL OFF: do not recommend alcoholic beverages; pubs/bars only if framed as food/atmosphere with clear non-alcoholic options.");
  }
  if (!planner.includeCoffeeTeaRecommendations) {
    out.push("COFFEE/TEA OFF: skip dedicated cafe/tea guidance except where essential to logistics.");
  }
  if (!planner.includeSupermarketShopTips) {
    out.push("SHOP TIPS OFF: omit supermarket/market shopping tips unless strictly needed for dietary safety.");
  }
  if (!planner.includePracticalWarnings) {
    out.push("PRACTICAL WARNINGS OFF: avoid tap water / hygiene / tourist-menu warnings unless a hard safety issue remains.");
  }
  if (planner.avoidTouristTrapsAggressively) {
    out.push("AGGRESSIVE ANTI-TRAP: downgrade central multi-language photo menus; prefer credible alternatives a few streets away.");
  }
  return out;
};
