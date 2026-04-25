/** Trip wizard + planning: how the traveler wants to experience food and drink. */
export type FoodDrinkStrategy =
  | "balanced"
  | "high_end"
  | "local_authentic"
  | "not_tourist_trap"
  | "street_food"
  | "budget_local"
  | "seafood_focus"
  | "comfort_safe"
  | "experimental";

export const FOOD_DRINK_STRATEGIES: readonly FoodDrinkStrategy[] = [
  "balanced",
  "high_end",
  "local_authentic",
  "not_tourist_trap",
  "street_food",
  "budget_local",
  "seafood_focus",
  "comfort_safe",
  "experimental",
] as const;

export interface FoodDrinkPlannerSettings {
  primaryFoodDrinkStrategy: FoodDrinkStrategy;
  secondaryFoodDrinkStrategies: FoodDrinkStrategy[];
  includeAlcoholRecommendations: boolean;
  includeCoffeeTeaRecommendations: boolean;
  includeSupermarketShopTips: boolean;
  includePracticalWarnings: boolean;
  avoidTouristTrapsAggressively: boolean;
}

export type FoodCultureInsightType =
  | "dish"
  | "drink"
  | "tip"
  | "pattern"
  | "warning"
  | "strategy"
  | "city_specialty"
  | "country_specialty"
  | "avoidance";

export type FoodCultureInsight = {
  id: string;
  type: FoodCultureInsightType;
  label: string;
  description: string;
  appliesTo?: {
    country?: string;
    city?: string;
    region?: string;
    neighborhood?: string;
  };
  context?: {
    timeOfDay?: "morning" | "lunch" | "afternoon" | "dinner" | "night";
    locationType?: "restaurant" | "street" | "supermarket" | "bar" | "pub" | "cafe" | "market";
    budgetFit?: "budget" | "mid" | "premium";
    strategyFit?: FoodDrinkStrategy[];
  };
  priority: "high" | "medium" | "low";
  confidence: "low" | "medium" | "high";
  source: "curated" | "ai" | "provider" | "user_memory";
};

export type FoodCultureLayer = {
  destinationKey: string;
  country?: string;
  city?: string;
  region?: string;
  strategies: {
    primary: FoodDrinkStrategy;
    secondary: FoodDrinkStrategy[];
  };
  insights: FoodCultureInsight[];
  summary: string;
  mustTryDishes: FoodCultureInsight[];
  mustTryDrinks: FoodCultureInsight[];
  warnings: FoodCultureInsight[];
};

/** Curated seed row — extended over time; not sent wholesale to AI. */
export type FoodCultureKnowledgeEntry = {
  country?: string;
  city?: string;
  region?: string;
  strengths: string[];
  mustTryDishes: string[];
  mustTryDrinks: string[];
  practicalTips: string[];
  avoidTips: string[];
  strategyHints: Partial<Record<FoodDrinkStrategy, string[]>>;
};
