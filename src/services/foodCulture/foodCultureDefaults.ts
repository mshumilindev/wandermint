import type { FoodDrinkPlannerSettings, FoodDrinkStrategy } from "../../entities/food-culture/model";
import { FOOD_DRINK_STRATEGIES } from "../../entities/food-culture/model";

const isStrategy = (v: unknown): v is FoodDrinkStrategy =>
  typeof v === "string" && (FOOD_DRINK_STRATEGIES as readonly string[]).includes(v);

export const defaultFoodDrinkPlannerSettings = (): FoodDrinkPlannerSettings => ({
  primaryFoodDrinkStrategy: "balanced",
  secondaryFoodDrinkStrategies: [],
  includeAlcoholRecommendations: true,
  includeCoffeeTeaRecommendations: true,
  includeSupermarketShopTips: false,
  includePracticalWarnings: true,
  avoidTouristTrapsAggressively: false,
});

export const mergeFoodDrinkPlannerSettings = (raw: Partial<FoodDrinkPlannerSettings> | undefined | null): FoodDrinkPlannerSettings => {
  const d = defaultFoodDrinkPlannerSettings();
  if (!raw || typeof raw !== "object") {
    return d;
  }
  const secondary = Array.isArray(raw.secondaryFoodDrinkStrategies)
    ? raw.secondaryFoodDrinkStrategies.filter(isStrategy).slice(0, 4)
    : [];
  let primary: FoodDrinkStrategy = isStrategy(raw.primaryFoodDrinkStrategy) ? raw.primaryFoodDrinkStrategy : d.primaryFoodDrinkStrategy;
  if (!isStrategy(primary)) {
    primary = d.primaryFoodDrinkStrategy;
  }
  const strategyDemandsTouristCaution = primary === "not_tourist_trap" || secondary.includes("not_tourist_trap");
  const avoidTrap =
    typeof raw.avoidTouristTrapsAggressively === "boolean"
      ? raw.avoidTouristTrapsAggressively
      : strategyDemandsTouristCaution
        ? true
        : d.avoidTouristTrapsAggressively;

  return {
    primaryFoodDrinkStrategy: primary,
    secondaryFoodDrinkStrategies: secondary,
    includeAlcoholRecommendations: raw.includeAlcoholRecommendations ?? d.includeAlcoholRecommendations,
    includeCoffeeTeaRecommendations: raw.includeCoffeeTeaRecommendations ?? d.includeCoffeeTeaRecommendations,
    includeSupermarketShopTips: raw.includeSupermarketShopTips ?? d.includeSupermarketShopTips,
    includePracticalWarnings: raw.includePracticalWarnings ?? d.includePracticalWarnings,
    avoidTouristTrapsAggressively: avoidTrap,
  };
};
