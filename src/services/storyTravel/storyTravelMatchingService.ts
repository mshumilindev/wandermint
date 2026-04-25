import type { PreferenceProfile } from "../../entities/user/model";
import { isDestinationLocationAvoided, mergePreferenceProfile } from "../preferences/preferenceConstraintsService";
import { STORY_TRAVEL_KNOWLEDGE } from "./storyTravelKnowledgeBase";
import type {
  StoryTravelExperience,
  StoryTravelKnowledgeExperienceSeed,
  StoryTravelPreferences,
  StoryTravelUserSignal,
} from "./storyTravelTypes";

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

export type StoryTravelMatchInput = {
  destinations: Array<{ city: string; country: string }>;
  tripDurationDays?: number;
  travelStyles: string[];
  pace?: "slow" | "balanced" | "dense";
  userSignals: StoryTravelUserSignal[];
  preferenceProfile?: PreferenceProfile | null;
  storyPrefs: StoryTravelPreferences;
  /** Wizard override for this trip — strongest wins over account density when set. */
  wizardStoryLevel?: "off" | "subtle" | "balanced" | "themed" | null;
  /** When true (e.g. homepage), allow weaker matches above a lower floor. */
  allowWeakForInspiration?: boolean;
};

const stableExperienceId = (entryKey: string, seed: StoryTravelKnowledgeExperienceSeed): string =>
  seed.id ??
  `${entryKey}__${norm(seed.title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)}`;

const seedToExperience = (seed: StoryTravelKnowledgeExperienceSeed, entryKey: string): StoryTravelExperience => ({
  ...seed,
  id: stableExperienceId(entryKey, seed),
  optional: true,
});

const experienceViolatesAvoids = (exp: StoryTravelExperience, profile: PreferenceProfile): boolean => {
  const merged = mergePreferenceProfile(profile);
  if (!merged.avoid.length) {
    return false;
  }
  for (const loc of exp.locations) {
    const country = loc.country?.trim() ?? "";
    if (!country) {
      continue;
    }
    if (isDestinationLocationAvoided(merged, { country, city: loc.city })) {
      return true;
    }
  }
  return false;
};

const passesDuration = (exp: StoryTravelExperience, days: number | undefined): boolean => {
  if (days === undefined) {
    return true;
  }
  if (exp.recommendedDuration === "multi_day") {
    return days >= 4;
  }
  if (exp.recommendedDuration === "full_day") {
    return days >= 2;
  }
  return true;
};

const passesLiteraryFilmToggles = (exp: StoryTravelExperience, prefs: StoryTravelPreferences): boolean => {
  const st = exp.sourceType;
  if (!prefs.showLiterary && (st === "book" || st === "author")) {
    return false;
  }
  if (!prefs.showFilmSeries && (st === "film" || st === "series" || st === "game")) {
    return false;
  }
  return true;
};

const isVibeOnlyExperience = (exp: StoryTravelExperience): boolean =>
  exp.locations.length > 0 && exp.locations.every((l) => l.relationship === "vibe_match");

const destinationScore = (exp: StoryTravelExperience, destinations: Array<{ city: string; country: string }>): number => {
  let best = 0;
  const cities = destinations.map((d) => norm(d.city)).filter(Boolean);
  const countries = destinations.map((d) => norm(d.country)).filter(Boolean);
  for (const loc of exp.locations) {
    const lc = norm(loc.city);
    const lco = norm(loc.country);
    for (const d of destinations) {
      const dc = norm(d.city);
      const dco = norm(d.country);
      if (lc && dc && lc === dc && lco && dco && lco === dco) {
        best = Math.max(best, 40);
      } else if (lc && dc && lc === dc) {
        best = Math.max(best, 32);
      } else if (lco && dco && lco === dco) {
        best = Math.max(best, 20);
      }
    }
  }
  if (best === 0 && countries.some((c) => exp.tags.some((t) => norm(t) === c))) {
    best = 12;
  }
  if (best === 0 && cities.some((c) => exp.tags.some((t) => norm(t) === c))) {
    best = 18;
  }
  return best;
};

const signalScore = (exp: StoryTravelExperience, signals: StoryTravelUserSignal[]): number => {
  let s = 0;
  const hay = `${exp.sourceTitle} ${exp.title} ${exp.tags.join(" ")} ${exp.authorOrCreator ?? ""}`.toLowerCase();
  for (const sig of signals) {
    for (const title of sig.relatedTitles) {
      if (title.length >= 3 && hay.includes(title.toLowerCase())) {
        s += sig.source === "user_selected" ? 45 : sig.source === "bucket_list" ? 30 : sig.source === "flicksync" ? 22 : 12;
      }
    }
    if (sig.label.length >= 3 && hay.includes(sig.label.toLowerCase())) {
      s += Math.round(sig.score);
    }
  }
  return Math.min(60, s);
};

const styleScore = (exp: StoryTravelExperience, styles: string[]): number => {
  const set = new Set(styles.map(norm));
  let bonus = 0;
  for (const f of exp.bestFitForTravelStyles) {
    if (set.has(norm(f))) {
      bonus += 10;
    }
  }
  if (set.has("culture") || set.has("literary")) {
    bonus += 6;
  }
  return bonus;
};

const effectiveDensity = (input: StoryTravelMatchInput): StoryTravelPreferences["density"] => {
  if (input.wizardStoryLevel === "off") {
    return "none";
  }
  if (input.wizardStoryLevel === "themed") {
    return "themed";
  }
  if (input.wizardStoryLevel === "balanced") {
    return "balanced";
  }
  if (input.wizardStoryLevel === "subtle") {
    return "subtle";
  }
  return input.storyPrefs.density;
};

const scoreThreshold = (input: StoryTravelMatchInput): number => {
  const d = effectiveDensity(input);
  if (d === "none") {
    return 999;
  }
  if (input.allowWeakForInspiration) {
    return d === "themed" ? 20 : 28;
  }
  return d === "themed" ? 22 : d === "balanced" ? 32 : 38;
};

const maxResults = (input: StoryTravelMatchInput): number => {
  const d = effectiveDensity(input);
  if (d === "none") {
    return 0;
  }
  if (d === "themed") {
    return 4;
  }
  if (d === "balanced") {
    return 3;
  }
  return 2;
};

/**
 * Deterministic match + score. Does not call remote AI.
 */
export const findStoryTravelMatches = (input: StoryTravelMatchInput): StoryTravelExperience[] => {
  if (!input.storyPrefs.enabled) {
    return [];
  }
  const density = effectiveDensity(input);
  if (density === "none") {
    return [];
  }

  const profile = input.preferenceProfile ?? null;
  const threshold = scoreThreshold(input);
  const cap = maxResults(input);
  if (cap === 0) {
    return [];
  }

  const pacePenalty = input.pace === "dense" ? -18 : 0;
  const weakPenalty = (exp: StoryTravelExperience): number =>
    exp.destinationFit === "weak" || (exp.confidence === "low" && isVibeOnlyExperience(exp)) ? -15 : 0;

  const scored: Array<{ exp: StoryTravelExperience; score: number }> = [];

  for (const entry of STORY_TRAVEL_KNOWLEDGE) {
    for (const seed of entry.experiences) {
      const exp = seedToExperience(seed, entry.key);
      if (!passesLiteraryFilmToggles(exp, input.storyPrefs)) {
        continue;
      }
      if (!input.storyPrefs.showVibeMatches && isVibeOnlyExperience(exp)) {
        continue;
      }
      if (experienceViolatesAvoids(exp, mergePreferenceProfile(profile))) {
        continue;
      }
      if (!passesDuration(exp, input.tripDurationDays)) {
        continue;
      }
      const dScore = destinationScore(exp, input.destinations);
      if (dScore === 0 && !input.allowWeakForInspiration) {
        continue;
      }
      let score =
        dScore +
        signalScore(exp, input.userSignals) +
        styleScore(exp, input.travelStyles) +
        pacePenalty +
        weakPenalty(exp);
      if (exp.destinationFit === "regional" && dScore < 20) {
        score -= 8;
      }
      if (score >= threshold || (input.allowWeakForInspiration && score >= threshold - 10 && dScore > 0)) {
        scored.push({ exp, score });
      }
    }
  }

  const dedup = new Map<string, { exp: StoryTravelExperience; score: number }>();
  for (const row of scored) {
    const prev = dedup.get(row.exp.id);
    if (!prev || prev.score < row.score) {
      dedup.set(row.exp.id, row);
    }
  }

  return [...dedup.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map((r) => r.exp);
};

export const buildUserSignalsFromFlickAndBucket = (input: {
  flickInterestSignals: string[];
  bucketTitles: string[];
  manualHints: string[];
}): StoryTravelUserSignal[] => {
  const out: StoryTravelUserSignal[] = [];
  for (const line of input.flickInterestSignals) {
    const t = line.trim();
    if (t.length < 3) {
      continue;
    }
    out.push({
      key: `flick:${t}`,
      label: t,
      source: "flicksync",
      score: 18,
      confidence: "medium",
      relatedTitles: [t],
    });
  }
  for (const title of input.bucketTitles) {
    const t = title.trim();
    if (t.length < 3) {
      continue;
    }
    out.push({
      key: `bucket:${t}`,
      label: t,
      source: "bucket_list",
      score: 22,
      confidence: "medium",
      relatedTitles: [t],
    });
  }
  for (const t of input.manualHints) {
    const s = t.trim();
    if (s.length < 3) {
      continue;
    }
    out.push({
      key: `manual:${s}`,
      label: s,
      source: "manual_interest",
      score: 35,
      confidence: "high",
      relatedTitles: [s],
    });
  }
  return out.slice(0, 24);
};
