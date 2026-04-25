import type { RightNowExploreSpeed } from "../../../entities/user/model";
import type { WeatherContext } from "../../providers/contracts";
import type { PlanningContext } from "../../planning/planningContextBuilder";

export type RightNowSpendTier = "free" | "low" | "flexible";

export interface LocalScenarioTimeContext {
  /** Local wall-clock hour 0–23 (client device). */
  hour: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  spendTier: RightNowSpendTier;
}

/** Upper bound on stops from clock time only (AI / engine stay at or under this). */
export const maxStopsForMinutes = (availableMinutes: number): number => {
  const bySlot = Math.floor(availableMinutes / 18);
  return Math.min(10, Math.max(1, bySlot));
};

export const getRightNowBlockBounds = (availableMinutes: number, exploreSpeed: RightNowExploreSpeed): { min: number; max: number } => {
  const hardMax = maxStopsForMinutes(availableMinutes);
  if (exploreSpeed === "relaxed") {
    const softMax = Math.max(1, Math.min(hardMax, Math.round(hardMax * 0.55)));
    return { min: 1, max: softMax };
  }
  if (exploreSpeed === "packed") {
    return { min: 1, max: hardMax };
  }
  return { min: 1, max: Math.max(1, Math.min(hardMax, Math.round(hardMax * 0.82))) };
};

const exploreDensityLines = (exploreSpeed: RightNowExploreSpeed, bounds: { min: number; max: number }): string[] => {
  if (exploreSpeed === "relaxed") {
    return [
      `Explore speed RELAXED: prefer ${bounds.min}–${bounds.max} stops. A single rich anchor stop is valid when it fits the window.`,
      "Leave generous dwell time; do not pad with extra venues only to look busy.",
    ];
  }
  if (exploreSpeed === "packed") {
    return [
      `Explore speed PACKED: you may use up to ${bounds.max} stops when each fits opening hours and walking time inside the window.`,
      "Prefer tight, walkable sequences; skip weak filler stops.",
    ];
  }
  return [
    `Explore speed BALANCED: prefer ${bounds.min}–${bounds.max} stops that fit comfortably in the available minutes.`,
    "Let the natural route dictate the count — fewer strong stops beats weak extras.",
  ];
};

const timeFitRules = (ctx: LocalScenarioTimeContext): string[] => {
  const isWeekday = ctx.weekday >= 1 && ctx.weekday <= 5;
  const lateNight = ctx.hour >= 22 || ctx.hour < 5;
  const brunchWindow = ctx.hour >= 10 && ctx.hour < 14;

  const lines: string[] = [
    `Local clock context: hour ${ctx.hour}, weekday index ${ctx.weekday} (0=Sun).`,
    "Match each block to a believable time-of-day: avoid positioning a primary coffee stop very late at night unless it is clearly a late lounge; after 22:00 prefer calm evening formats.",
    "Avoid heavy alcohol-led blocks in early morning unless the vibe is explicitly brunch / lunch aperitivo (e.g. mimosa, spritz at brunch).",
  ];
  if (isWeekday && !brunchWindow) {
    lines.push("This is a right-now weekday plan: suggest fewer alcohol-forward stops overall than you would on a weekend night.");
  }
  if (lateNight) {
    lines.push("Late night: prefer low-stimulation, safe, still-open formats; de-emphasize morning coffee tropes.");
  }
  if (ctx.spendTier === "free") {
    lines.push(
      "Spend tier FREE: prioritize no-entry public spaces, walks, viewpoints, parks, free civic sights, and short hops; keep paid venues secondary and clearly optional.",
    );
  } else if (ctx.spendTier === "low") {
    lines.push("Spend tier LOW: prefer low or no entry, short paid add-ons only when they clearly improve the route.");
  }
  return lines;
};

export const buildLocalScenarioPrompt = (
  locationLabel: string,
  vibe: string,
  availableMinutes: number,
  weather: WeatherContext,
  maxRadiusMeters: number,
  planningContext?: PlanningContext,
  timeContext?: LocalScenarioTimeContext,
  exploreSpeed: RightNowExploreSpeed = "balanced",
  foodCultureAppendix?: string,
  storyTravelAppendix?: string,
): string => {
  const bounds = getRightNowBlockBounds(availableMinutes, exploreSpeed);
  return [
    `Generate structured right-now local scenarios with ${bounds.min} to ${bounds.max} ordered blocks (pick the count that honestly fits walking, hours, and ${availableMinutes} minutes).`,
    "Never force extra stops to hit a fixed count; one excellent stop is acceptable when it best matches the window.",
    ...exploreDensityLines(exploreSpeed, bounds),
    "Use provider facts as factual source of truth. Explain uncertainty when provider data is partial.",
    "Prioritize the closest coherent routes first.",
    "Use the user's exact local area as the hard boundary.",
    "Only use places inside the current city or immediate nearby radius. Never infer famous global places from partial names.",
    "Do not compose a scenario with any stop outside the current local area or outside the current country context.",
    "Only place a venue in a time slot if its published hours plausibly fit that slot. If hours are unclear, keep the wording cautious.",
    "Do not stack food-food-food or drink-drink-drink unless the user explicitly wants a crawl or tasting route.",
    "Favor category variety and forward-moving nearby sequences over backtracking.",
    ...(timeContext ? timeFitRules(timeContext) : []),
    `Location: ${locationLabel}`,
    `Max local radius: ${maxRadiusMeters} meters`,
    `Vibe: ${vibe}`,
    `Available minutes: ${availableMinutes}`,
    `Weather: ${weather.condition}, ${weather.precipitationChance}% precipitation, certainty ${weather.certainty}`,
    `Memory guidance: ${planningContext?.promptGuidance.join(" | ") ?? "Prefer novelty by ranking, not hard filtering."}`,
    foodCultureAppendix?.trim() ? `FOOD & DRINK CONTEXT (curated + strategy — keep tips short and route-relevant):\n${foodCultureAppendix.trim()}` : "",
    storyTravelAppendix?.trim() ? storyTravelAppendix.trim() : "",
  ]
    .filter(Boolean)
    .join("\n");
};
