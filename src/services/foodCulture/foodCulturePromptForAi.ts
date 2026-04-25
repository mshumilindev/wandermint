import type { FoodCultureLayer } from "../../entities/food-culture/model";
import type { FoodDrinkPlannerSettings } from "../../entities/food-culture/model";
import { buildFoodStrategyBehaviorPrompt } from "./foodCultureStrategyPrompt";

const trimLines = (lines: string[], maxChars: number): string => {
  let out = "";
  for (const line of lines) {
    if (out.length + line.length + 1 > maxChars) {
      break;
    }
    out = out ? `${out}\n${line}` : line;
  }
  return out;
};

/** Compact curated grounding for the model — not the full knowledge base. */
export const formatFoodCultureLayersForTripPrompt = (layers: FoodCultureLayer[], planner: FoodDrinkPlannerSettings, budgetStyle: string): string => {
  const behavior = buildFoodStrategyBehaviorPrompt(planner);
  const segments = layers
    .map((layer) => {
      const loc = [layer.city, layer.country].filter(Boolean).join(", ");
      const dishes = layer.mustTryDishes.slice(0, 4).map((d) => `- dish: ${d.label}`);
      const drinks = layer.mustTryDrinks.slice(0, 4).map((d) => `- drink: ${d.label}`);
      const warns = layer.warnings.slice(0, 3).map((w) => `- caution: ${w.description}`);
      const tips = layer.insights
        .filter((i) => i.type === "tip" || i.type === "pattern")
        .slice(0, 4)
        .map((i) => `- ${i.type}: ${i.description}`);
      const body = [...dishes, ...drinks, ...tips, ...warns].join("\n");
      return `DESTINATION SEGMENT: ${loc}\nSUMMARY: ${layer.summary}\n${body}`.trim();
    })
    .filter(Boolean);

  const instructions = [
    "FOOD & DRINK INTELLIGENCE (use as grounding — do not contradict user dislikes or toggles):",
    `Budget posture for food: ${budgetStyle}.`,
    "Generate 5–10 concise, destination-useful food/drink insights total across the trip (not per sentence of filler). Prefer city-level facts from the segment blocks above.",
    "For meal blocks: add foodCultureNotes (max 2 strings, each max 160 chars) only on meal-type blocks when it genuinely helps — insider timing, format, or caution. No fake venue names.",
    "Never output generic lines like 'try local food' or 'food is good here'.",
    ...behavior,
    ...segments,
  ];

  return trimLines(instructions, 9000);
};

export const formatFoodCultureForRightNowPrompt = (layer: FoodCultureLayer | null, planner: FoodDrinkPlannerSettings, hour: number): string => {
  const behavior = buildFoodStrategyBehaviorPrompt(planner);
  const tod =
    hour < 11 ? "morning" : hour < 14 ? "lunch" : hour < 17 ? "afternoon" : hour < 21 ? "dinner" : "night";
  const timeHint =
    tod === "morning"
      ? "Prefer coffee/bakery/cafe tips when food is included."
      : tod === "lunch"
        ? "Prefer fast credible lunch formats (markets, casual counters, set menus)."
        : tod === "night"
          ? "Evening: pubs/izakaya/wine/seafood only when appropriate and alcohol toggle allows."
          : "Keep food/drink tips short and route-relevant.";

  const curated = layer
    ? `LOCAL FOOD SIGNALS (${[layer.city, layer.country].filter(Boolean).join(", ")}): ${layer.summary}\n` +
      [
        ...layer.mustTryDishes.slice(0, 2).map((d) => `- ${d.label}`),
        ...layer.mustTryDrinks.slice(0, 2).map((d) => `- ${d.label}`),
        ...layer.warnings.slice(0, 1).map((w) => `- caution: ${w.description}`),
      ].join("\n")
    : "No curated food culture row matched — stay cautious, avoid invented dishes, keep tips practical.";

  return trimLines([...behavior, timeHint, curated], 3500);
};
