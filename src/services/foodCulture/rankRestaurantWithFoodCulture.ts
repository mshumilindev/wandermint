import type { FoodCultureInsight } from "../../entities/food-culture/model";
import type { FoodDrinkPlannerSettings } from "../../entities/food-culture/model";

export interface RestaurantRankInput {
  name: string;
  categories: string[];
  rating?: number;
  priceLevel?: number;
}

const norm = (s: string): string => s.trim().toLowerCase();

const haystack = (r: RestaurantRankInput): string => {
  return `${r.name} ${r.categories.join(" ")}`.toLowerCase();
};

const matchesInsightText = (text: string, h: string): boolean => {
  const t = norm(text);
  if (t.length < 3) {
    return false;
  }
  return h.includes(t) || t.split(/\s+/).every((w) => w.length < 3 || h.includes(w));
};

const chainPenalty = (h: string, comfortSafe: boolean): number => {
  const chains = ["mcdonald", "burger king", "kfc", "subway", "starbucks", "domino", "pizza hut"];
  if (!chains.some((c) => h.includes(c))) {
    return 0;
  }
  return comfortSafe ? -6 : -32;
};

const touristTrapHeuristic = (r: RestaurantRankInput, aggressive: boolean): number => {
  let penalty = 0;
  const h = haystack(r);
  if (h.includes("hard rock") || h.includes("planet hollywood")) {
    penalty -= 40;
  }
  if (aggressive && r.priceLevel !== undefined && r.priceLevel >= 3 && (r.rating === undefined || r.rating < 4)) {
    penalty -= 12;
  }
  return penalty;
};

/**
 * Returns a score adjustment added on top of existing restaurant ranking.
 * Typical useful range roughly −40…+35.
 */
export const rankRestaurantWithFoodCulture = (input: {
  restaurant: RestaurantRankInput;
  destinationInsights: FoodCultureInsight[];
  strategy: FoodDrinkPlannerSettings;
  userFoodPreferences: string[];
  userAvoids: string[];
}): number => {
  const h = haystack(input.restaurant);
  let score = 0;

  for (const dislike of input.userAvoids) {
    if (matchesInsightText(dislike, h)) {
      return -80;
    }
  }

  const seafoodDisliked = input.userAvoids.some((a) => {
    const x = norm(a);
    return x.includes("seafood") || x.includes("fish") || x.includes("shellfish");
  });
  const seafoodBoost =
    input.strategy.primaryFoodDrinkStrategy === "seafood_focus" ||
    input.strategy.secondaryFoodDrinkStrategies.includes("seafood_focus");
  if (seafoodDisliked && (h.includes("seafood") || h.includes("fish") || h.includes("oyster"))) {
    score -= 45;
  } else if (seafoodBoost && (h.includes("seafood") || h.includes("fish") || h.includes("grill") || h.includes("marisquería"))) {
    score += 18;
  }

  for (const pref of input.userFoodPreferences) {
    if (matchesInsightText(pref, h)) {
      score += 14;
    }
  }

  for (const ins of input.destinationInsights) {
    if (ins.type === "dish" || ins.type === "drink" || ins.type === "pattern") {
      if (matchesInsightText(ins.label, h) || matchesInsightText(ins.description, h)) {
        score += ins.priority === "high" ? 12 : 7;
      }
    }
    if (ins.type === "avoidance" && matchesInsightText(ins.description, h)) {
      score -= input.strategy.avoidTouristTrapsAggressively ? 18 : 10;
    }
  }

  if (input.strategy.primaryFoodDrinkStrategy === "high_end") {
    const rr = input.restaurant;
    if (rr.priceLevel !== undefined && rr.priceLevel >= 3) {
      score += 10;
    }
    if ((rr.rating ?? 0) >= 4.3) {
      score += 8;
    }
  }

  if (input.strategy.primaryFoodDrinkStrategy === "budget_local") {
    const rr = input.restaurant;
    if (rr.priceLevel !== undefined && rr.priceLevel <= 1) {
      score += 10;
    }
    if (h.includes("fine dining") || h.includes("tasting menu")) {
      score -= 15;
    }
  }

  if (!input.strategy.includeAlcoholRecommendations) {
    if (h.includes("wine bar") || h.includes("brewery") || h.includes("pub") || h.includes("cocktail")) {
      score -= 25;
    }
  }

  score += chainPenalty(h, input.strategy.primaryFoodDrinkStrategy === "comfort_safe");
  score += touristTrapHeuristic(input.restaurant, input.strategy.avoidTouristTrapsAggressively);

  return score;
};
