import { buildHomeSuggestionContext } from "./homeTripSuggestionContextBuilder";
import { refineTripSuggestions } from "./homeTripSuggestionAiLayer";
import { buildCuratedFallbackSuggestions, scoreHomeTripSuggestions } from "./homeTripSuggestionScoring";
import type { HomeTripSuggestionCandidate, SuggestedTrip } from "./homeTripSuggestionTypes";
import type { StoryTravelExperience } from "../storyTravel/storyTravelTypes";
import { storySuggestionsForHomeContext } from "../storyTravel/storyTravelSuggestionService";

const stripScore = (rows: HomeTripSuggestionCandidate[]): SuggestedTrip[] =>
  rows.map(({ score: _s, ...rest }) => rest);

const isSignalThin = (ctx: Awaited<ReturnType<typeof buildHomeSuggestionContext>>): boolean => {
  const hasTrips = ctx.tripHistory.length > 0;
  const hasBucket = ctx.bucketList.rows.length > 0;
  const hasFlick = ctx.flickSync.interestSignals.length > 0;
  const hasMusic = (ctx.music?.topGenres.length ?? 0) > 0;
  const hasBehavior = ctx.travelBehavior !== null;
  const signals = [hasTrips, hasBucket, hasFlick, hasMusic, hasBehavior].filter(Boolean).length;
  return signals < 2;
};

export type HomeTripSuggestionResult = {
  suggestions: SuggestedTrip[];
  usedFallback: boolean;
  storyInspirations: StoryTravelExperience[];
};

/**
 * Orchestrates context → deterministic scoring → refinement. Never returns an empty list.
 */
export const getHomeTripSuggestions = async (userId: string): Promise<HomeTripSuggestionResult> => {
  const uid = userId.trim();
  if (!uid) {
    return { suggestions: stripScore(buildCuratedFallbackSuggestions()), usedFallback: true, storyInspirations: [] };
  }

  const ctx = await buildHomeSuggestionContext(uid);
  const storyInspirations = storySuggestionsForHomeContext(ctx, ctx.accountPreferences ?? null);
  const deterministic = scoreHomeTripSuggestions(ctx, 8);
  const refined =
    deterministic.length > 0 ? await refineTripSuggestions(deterministic, ctx) : ([] as HomeTripSuggestionCandidate[]);

  let suggestions = stripScore(refined.length > 0 ? refined : deterministic);
  let usedFallback = false;

  if (suggestions.length === 0) {
    return { suggestions: stripScore(buildCuratedFallbackSuggestions(ctx.budget.currency)), usedFallback: true, storyInspirations };
  }

  if (isSignalThin(ctx) && suggestions.length < 3) {
    const fallback = stripScore(buildCuratedFallbackSuggestions(ctx.budget.currency));
    const keys = new Set(suggestions.map((s) => `${s.destination.country}|${s.destination.city ?? ""}`));
    for (const f of fallback) {
      if (suggestions.length >= 5) {
        break;
      }
      const k = `${f.destination.country}|${f.destination.city ?? ""}`;
      if (!keys.has(k)) {
        keys.add(k);
        suggestions.push(f);
        usedFallback = true;
      }
    }
  }

  return { suggestions: suggestions.slice(0, 5), usedFallback, storyInspirations };
};
