import type { HomeSuggestionContext } from "./homeTripSuggestionContextBuilder";
import type { HomeTripSuggestionCandidate } from "./homeTripSuggestionTypes";

export type HomeSuggestionAiContextSummary = {
  personalizationAllowed: boolean;
  tripCount: number;
  bucketOpenCount: number;
  flickSyncSignalCount: number;
  musicGenreSample: string[];
  planningStyle?: string;
  executionStyle?: string;
};

export const summarizeContextForAi = (ctx: HomeSuggestionContext): HomeSuggestionAiContextSummary => ({
  personalizationAllowed: ctx.personalizationAllowed,
  tripCount: ctx.tripHistory.length,
  bucketOpenCount: ctx.bucketList.rows.length,
  flickSyncSignalCount: ctx.flickSync.interestSignals.length,
  musicGenreSample: ctx.music?.topGenres.slice(0, 4) ?? [],
  planningStyle: ctx.travelBehavior?.planningStyle,
  executionStyle: ctx.travelBehavior?.executionStyle,
});

/**
 * Refinement pass: reorder, tighten copy, drop weak rows.
 * Does not call remote models — keeps behaviour stable and guarantees no invented destinations.
 * Remote LLM synthesis can be swapped in here later under a feature flag, still constrained to this contract.
 */
export const refineTripSuggestions = async (
  candidates: HomeTripSuggestionCandidate[],
  context: HomeSuggestionContext,
): Promise<HomeTripSuggestionCandidate[]> => {
  void summarizeContextForAi(context);
  const minConfidence = 0.12;
  const ranked = [...candidates]
    .filter((c) => c.confidence >= minConfidence)
    .sort((a, b) => {
      const wa = a.score * (0.5 + a.confidence * 0.5);
      const wb = b.score * (0.5 + b.confidence * 0.5);
      return wb - wa;
    });

  const cityLine = (c: HomeTripSuggestionCandidate): string =>
    c.destination.city ? `${c.destination.city}, ${c.destination.country}` : c.destination.country;

  return ranked.slice(0, 5).map((c) => {
    const place = cityLine(c);
    const pacing =
      context.travelBehavior?.executionStyle === "slow"
        ? "Keep the cadence relaxed like your recent trips."
        : context.travelBehavior?.executionStyle === "fast"
          ? "Pack the days — you tend to move quickly once on the ground."
          : "Balanced pacing matches how you usually execute plans.";

    const title =
      c.type === "return_trip"
        ? `Return to ${place}`
        : c.type === "bucket_list_push"
          ? c.title.includes("—")
            ? c.title
            : `${place} — ${c.title}`
          : `${c.durationDays} days in ${place}`;

    const reasoning =
      c.confidence > 0.65 ? `${c.reasoning} ${pacing}` : c.reasoning;

    return {
      ...c,
      title: title.trim(),
      reasoning: reasoning.replace(/\s+/g, " ").trim(),
      destination: { ...c.destination },
      estimatedBudget: { ...c.estimatedBudget },
      durationDays: c.durationDays,
    };
  });
};
