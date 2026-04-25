import type { FoodCultureLayer } from "../../entities/food-culture/model";
import type { FoodDrinkPlannerSettings } from "../../entities/food-culture/model";

const STORAGE_PREFIX = "wm_food_culture_v1:";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type CachedPayload = {
  expiresAt: number;
  layer: FoodCultureLayer;
};

const fnv1a32 = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

export const foodCultureCacheKey = (input: {
  city: string;
  country: string;
  planner: FoodDrinkPlannerSettings;
  foodInterests: string[];
  avoids: string[];
}): string => {
  const payload = JSON.stringify({
    c: input.city.trim().toLowerCase(),
    co: input.country.trim().toLowerCase(),
    p: input.planner.primaryFoodDrinkStrategy,
    s: [...input.planner.secondaryFoodDrinkStrategies].sort(),
    a: input.planner.includeAlcoholRecommendations,
    cf: input.planner.includeCoffeeTeaRecommendations,
    sh: input.planner.includeSupermarketShopTips,
    w: input.planner.includePracticalWarnings,
    t: input.planner.avoidTouristTrapsAggressively,
    fi: [...input.foodInterests].map((s) => s.trim().toLowerCase()).filter(Boolean).sort(),
    av: [...input.avoids].map((s) => s.trim().toLowerCase()).filter(Boolean).sort(),
  });
  return `${STORAGE_PREFIX}${fnv1a32(payload)}`;
};

export const readFoodCultureLayerFromCache = (key: string): FoodCultureLayer | null => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed || typeof parsed.expiresAt !== "number" || !parsed.layer) {
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.layer;
  } catch {
    return null;
  }
};

export const writeFoodCultureLayerToCache = (key: string, layer: FoodCultureLayer): void => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const payload: CachedPayload = { expiresAt: Date.now() + TTL_MS, layer };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
};

export const getOrBuildFoodCultureLayer = (input: {
  city: string;
  country: string;
  planner: FoodDrinkPlannerSettings;
  foodInterests: string[];
  avoids: string[];
  build: () => FoodCultureLayer;
}): FoodCultureLayer => {
  const key = foodCultureCacheKey(input);
  const hit = readFoodCultureLayerFromCache(key);
  if (hit) {
    return hit;
  }
  const layer = input.build();
  writeFoodCultureLayerToCache(key, layer);
  return layer;
};
