import type { Confidence, MusicTasteProfile, MusicVibeProfile } from "../../../integrations/music/musicTypes";
import type { MusicEventSuggestion, TripMusicEventWindow } from "../../events/musicEventTypes";

type VibeCacheEntry = { profile: MusicVibeProfile; storedAt: number };
type DecisionCacheEntry = { decision: { shouldSuggest: boolean; confidence: number; reason: string }; storedAt: number };

const VIBE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DECISION_TTL_MS = 24 * 60 * 60 * 1000;

const vibeCache = new Map<string, VibeCacheEntry>();
const decisionCache = new Map<string, DecisionCacheEntry>();

const hashKey = (raw: string): string => {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
};

export const interpretMusicTasteProfile = async (
  profile: MusicTasteProfile,
  allowAi: boolean,
): Promise<MusicVibeProfile> => {
  const key = hashKey(`${profile.updatedAt}|${profile.topGenres
    .slice(0, 5)
    .map((g) => g.name)
    .join(",")}`);
  const cached = vibeCache.get(key);
  if (cached && Date.now() - cached.storedAt < VIBE_TTL_MS) {
    return cached.profile;
  }
  void allowAi;
  const topGenres = profile.topGenres.slice(0, 8).map((g) => g.name);
  const scenes = profile.scenes.slice(0, 4).map((s) => s.label);
  const artists = profile.topArtists.slice(0, 5).map((a) => a.name);
  const travelVibe =
    scenes[0] ??
    (topGenres.length ? `Grounded in ${topGenres.slice(0, 3).join(", ")}` : "Eclectic listening mix");
  const preferred = [...new Set([...scenes, ...topGenres.slice(0, 3).map((g) => `${g} leaning stops`)])].slice(0, 6);
  const avoid: string[] = [];
  const explanation =
    artists.length > 0
      ? `Strongest Spotify anchors include ${artists.slice(0, 3).join(", ")} — use only as optional texture, not as a mandate.`
      : "Music taste is light or sparse — keep any music-adjacent ideas optional.";
  const confidence: Confidence =
    profile.topArtists.filter((a) => a.confidence === "high").length >= 2 ? "high" : profile.topGenres.length >= 4 ? "medium" : "low";
  const vibe: MusicVibeProfile = {
    travelVibe,
    preferredExperienceTypes: preferred,
    avoidExperienceTypes: avoid,
    explanation,
    confidence,
  };
  vibeCache.set(key, { profile: vibe, storedAt: Date.now() });
  return vibe;
};

export type MusicSuggestionAiInput = {
  suggestion: MusicEventSuggestion;
  trip: TripMusicEventWindow;
  profileSummary: Pick<MusicTasteProfile, "topArtists" | "topGenres" | "updatedAt">;
};

export const evaluateMusicSuggestionRelevance = async (input: MusicSuggestionAiInput): Promise<{ shouldSuggest: boolean; confidence: number; reason: string }> => {
  const key = hashKey(
    `${input.profileSummary.updatedAt}|${input.suggestion.id}|${input.trip.dateRange.start}|${input.trip.dateRange.end}`,
  );
  const cached = decisionCache.get(key);
  if (cached && Date.now() - cached.storedAt < DECISION_TTL_MS) {
    return cached.decision;
  }
  let score = 0.4;
  if (input.suggestion.matchedArtistName) {
    score += 0.35;
  }
  if (input.suggestion.matchedGenre) {
    score += 0.15;
  }
  if (input.suggestion.confidence === "high") {
    score += 0.1;
  }
  const shouldSuggest = score >= 0.65;
  const decision = {
    shouldSuggest,
    confidence: Math.min(1, score),
    reason: shouldSuggest
      ? "Strong overlap between event signals and your summarized music taste."
      : "Weak overlap with your summarized music taste.",
  };
  decisionCache.set(key, { decision, storedAt: Date.now() });
  return decision;
};

export const generateMusicSuggestionExplanation = async (input: {
  suggestionTitle: string;
  matchedArtistName?: string;
  matchedGenre?: string;
  city?: string;
}): Promise<string> => {
  if (input.matchedArtistName?.trim()) {
    return `Suggested because ${input.matchedArtistName} is one of your strongest Spotify signals and “${input.suggestionTitle}” fits ${input.city ?? "the trip destination"}.`;
  }
  if (input.matchedGenre?.trim()) {
    return `Suggested because ${input.matchedGenre} matches your top genre signals for “${input.suggestionTitle}”.`;
  }
  return "Matched with your connected music profile.";
};
