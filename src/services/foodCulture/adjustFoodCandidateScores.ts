import type { PlaceSnapshot } from "../../entities/activity/model";
import type { FoodCultureLayer } from "../../entities/food-culture/model";
import type { FoodDrinkPlannerSettings } from "../../entities/food-culture/model";
import { rankRestaurantWithFoodCulture } from "./rankRestaurantWithFoodCulture";

export type FoodCandidateLike = {
  relevanceScore: number;
  place: PlaceSnapshot;
};

const snapshotToRankInput = (place: PlaceSnapshot): { name: string; categories: string[]; rating?: number; priceLevel?: number } => ({
  name: place.name,
  categories: [place.openingHoursLabel ?? "", place.provider].filter(Boolean),
  rating: place.rating,
  priceLevel: place.priceLevel,
});

export const adjustFoodCandidateScores = <T extends FoodCandidateLike>(
  candidates: T[],
  layer: FoodCultureLayer | null,
  planner: FoodDrinkPlannerSettings,
  foodInterests: string[],
  avoids: string[],
): T[] => {
  if (candidates.length === 0) {
    return candidates;
  }
  const insights = layer?.insights ?? [];
  return candidates
    .map((c) => {
      const delta =
        rankRestaurantWithFoodCulture({
          restaurant: snapshotToRankInput(c.place),
          destinationInsights: insights,
          strategy: planner,
          userFoodPreferences: foodInterests,
          userAvoids: avoids,
        }) / 120;
      return { ...c, relevanceScore: Math.max(0.05, c.relevanceScore + delta) };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
};
