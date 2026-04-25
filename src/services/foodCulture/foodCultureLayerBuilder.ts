import type {
  FoodCultureInsight,
  FoodCultureInsightType,
  FoodCultureLayer,
  FoodCultureKnowledgeEntry,
  FoodDrinkStrategy,
} from "../../entities/food-culture/model";
import type { FoodDrinkPlannerSettings } from "../../entities/food-culture/model";
import { createClientId } from "../../shared/lib/id";
import { findFoodCultureKnowledgeMatches } from "./foodCultureKnowledgeBase";

const mk = (
  type: FoodCultureInsightType,
  label: string,
  description: string,
  priority: FoodCultureInsight["priority"],
  confidence: FoodCultureInsight["confidence"],
  applies?: FoodCultureInsight["appliesTo"],
): FoodCultureInsight => ({
  id: createClientId("fc_insight"),
  type,
  label,
  description,
  appliesTo: applies,
  priority,
  confidence,
  source: "curated",
});

const dedupeInsightKey = (i: FoodCultureInsight): string => `${i.type}:${i.label.trim().toLowerCase()}`;

const mergeEntriesToInsights = (entries: FoodCultureKnowledgeEntry[], country: string, city: string): FoodCultureInsight[] => {
  const out: FoodCultureInsight[] = [];
  const seen = new Set<string>();

  const push = (ins: FoodCultureInsight): void => {
    const k = dedupeInsightKey(ins);
    if (seen.has(k)) {
      return;
    }
    seen.add(k);
    out.push(ins);
  };

  for (const e of entries) {
    const applies = { country: e.country?.trim() || country, city: e.city?.trim() || undefined };
    for (const s of e.strengths) {
      push(mk("pattern", s, `Regional strength: ${s}.`, "medium", "high", applies));
    }
    for (const d of e.mustTryDishes) {
      push(mk("dish", d, `Worth seeking: ${d}.`, "high", "high", applies));
    }
    for (const dr of e.mustTryDrinks) {
      push(mk("drink", dr, `Local drink signal: ${dr}.`, "high", "high", applies));
    }
    for (const t of e.practicalTips) {
      push(mk("tip", t.slice(0, 80), t, "medium", "medium", applies));
    }
    for (const a of e.avoidTips) {
      push(mk("avoidance", a.slice(0, 80), a, "high", "medium", applies));
    }
  }
  return out;
};

const strategyHintInsights = (
  entries: FoodCultureKnowledgeEntry[],
  strategies: FoodDrinkStrategy[],
  country: string,
  city: string,
): FoodCultureInsight[] => {
  const out: FoodCultureInsight[] = [];
  const seen = new Set<string>();
  for (const strat of strategies) {
    for (const e of entries) {
      const lines = e.strategyHints[strat];
      if (!lines?.length) {
        continue;
      }
      const applies = { country: e.country?.trim() || country, city: e.city?.trim() || undefined };
      for (const line of lines) {
        const key = `${strat}:${line}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        out.push(mk("strategy", `${strat} strategy`, line, "medium", "high", applies));
      }
    }
  }
  return out;
};

const buildSummary = (city: string, country: string, insights: FoodCultureInsight[]): string => {
  const loc = [city, country].filter(Boolean).join(", ");
  const top = insights.filter((i) => i.priority === "high").slice(0, 4);
  if (top.length === 0) {
    return loc
      ? `Food culture for ${loc}: use strategy, budget, and user dislikes to choose grounded local formats — avoid generic filler.`
      : "Use food/drink strategy and budget to choose grounded local formats; keep claims cautious without curated destination data.";
  }
  return `${loc}: ${top.map((t) => t.label).join(" · ")}.`;
};

export const buildFoodCultureLayer = (input: {
  country: string;
  city: string;
  planner: FoodDrinkPlannerSettings;
}): FoodCultureLayer => {
  const country = input.country.trim();
  const city = input.city.trim();
  const entries = findFoodCultureKnowledgeMatches(city, country);
  const strategies: FoodDrinkStrategy[] = [
    input.planner.primaryFoodDrinkStrategy,
    ...input.planner.secondaryFoodDrinkStrategies,
  ];
  const baseInsights = entries.length > 0 ? mergeEntriesToInsights(entries, country, city) : [];
  const stratInsights = entries.length > 0 ? strategyHintInsights(entries, strategies, country, city) : [];
  const insights = [...stratInsights, ...baseInsights].slice(0, 48);

  const mustTryDishes = insights.filter((i) => i.type === "dish").slice(0, 12);
  const mustTryDrinks = insights.filter((i) => i.type === "drink").slice(0, 12);
  const warnings = insights.filter((i) => i.type === "avoidance" || i.type === "warning").slice(0, 10);

  const destinationKey = `${country}|${city}`.toLowerCase().replace(/\s+/g, "_");

  return {
    destinationKey,
    country: country || undefined,
    city: city || undefined,
    strategies: {
      primary: input.planner.primaryFoodDrinkStrategy,
      secondary: input.planner.secondaryFoodDrinkStrategies,
    },
    insights,
    summary: buildSummary(city, country, insights),
    mustTryDishes,
    mustTryDrinks,
    warnings,
  };
};
