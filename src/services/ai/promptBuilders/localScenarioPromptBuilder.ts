import type { WeatherContext } from "../../providers/contracts";

export const buildLocalScenarioPrompt = (
  locationLabel: string,
  vibe: string,
  availableMinutes: number,
  weather: WeatherContext,
  maxRadiusMeters: number,
): string =>
  [
    "Generate structured right-now local scenarios with 2 to 4 ordered blocks.",
    "Use provider facts as factual source of truth. Explain uncertainty when provider data is partial.",
    "Prioritize the closest coherent routes first.",
    "Use the user's exact local area as the hard boundary.",
    "Only use places inside the current city or immediate nearby radius. Never infer famous global places from partial names.",
    "Do not compose a scenario with any stop outside the current local area or outside the current country context.",
    "Only place a venue in a time slot if its published hours plausibly fit that slot. If hours are unclear, keep the wording cautious.",
    "Do not stack food-food-food or drink-drink-drink unless the user explicitly wants a crawl or tasting route.",
    "Favor category variety and forward-moving nearby sequences over backtracking.",
    `Location: ${locationLabel}`,
    `Max local radius: ${maxRadiusMeters} meters`,
    `Vibe: ${vibe}`,
    `Available minutes: ${availableMinutes}`,
    `Weather: ${weather.condition}, ${weather.precipitationChance}% precipitation, certainty ${weather.certainty}`,
  ].join("\n");
