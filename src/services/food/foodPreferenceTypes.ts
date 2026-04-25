import type { PlaceCandidate } from "../places/placeTypes";

export type FoodPreference =
  | {
      type: "restaurant";
      place: PlaceCandidate;
    }
  | {
      type: "intent";
      label: string;
      normalizedTags: string[];
    };

export const MAX_FOOD_PREFERENCES = 14;

export const foodPreferenceDedupeKey = (pref: FoodPreference): string => {
  if (pref.type === "restaurant") {
    return `r:${pref.place.provider}:${pref.place.providerId}`;
  }
  return `i:${pref.normalizedTags.slice().sort().join("|")}:${pref.label.trim().toLowerCase()}`;
};

/**
 * Flattens structured food prefs into legacy `TripPreferences.foodInterests` strings
 * (names + tags) for scoring, compaction, and older call sites.
 */
export const deriveFoodInterestsFromPreferences = (prefs: FoodPreference[] | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed.length < 2) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push(trimmed);
  };

  for (const p of prefs ?? []) {
    if (p.type === "restaurant") {
      push(p.place.name);
      for (const c of p.place.categories) {
        push(c);
      }
    } else {
      push(p.label);
      for (const t of p.normalizedTags) {
        push(t);
      }
    }
  }
  return out;
};

export const formatFoodPreferencesForPrompt = (prefs: FoodPreference[] | undefined): string => {
  if (!prefs?.length) {
    return "";
  }
  return prefs
    .map((p) =>
      p.type === "restaurant"
        ? `- RESTAURANT (specific target): ${p.place.name} [${p.place.provider}:${p.place.providerId}]${
            p.place.coordinates
              ? ` @${p.place.coordinates.lat.toFixed(5)},${p.place.coordinates.lng.toFixed(5)}`
              : ""
          }`
        : `- INTENT (cuisine / mood tags only — bias districts, cuisine mix, and lunch vs dinner placement; not a booked venue): "${p.label}" → [${p.normalizedTags.join(", ")}]`,
    )
    .join("\n");
};
