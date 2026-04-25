import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";
import type { Trip } from "../../entities/trip/model";
import type { UserPreferences } from "../../entities/user/model";
import type { HomeSuggestionContext } from "../home/homeTripSuggestionContextBuilder";
import { scoreFlickSyncLibraryInterest } from "../flicksync/flickSyncLibrarySignals";
import type { TripDraft } from "../planning/tripGenerationService";
import { mergeStoryTravelPreferences } from "./storyTravelDefaults";
import { buildUserSignalsFromFlickAndBucket, findStoryTravelMatches, type StoryTravelMatchInput } from "./storyTravelMatchingService";
import type { StoryTravelExperience } from "./storyTravelTypes";

const destinationsFromTrip = (trip: Pick<Trip, "tripSegments">): Array<{ city: string; country: string }> =>
  trip.tripSegments.map((s) => ({ city: s.city.trim(), country: s.country.trim() })).filter((d) => d.city && d.country);

const destinationsFromDraft = (draft: TripDraft): Array<{ city: string; country: string }> =>
  draft.tripSegments.map((s) => ({ city: s.city.trim(), country: s.country.trim() })).filter((d) => d.city && d.country);

const tripDurationFromDraft = (draft: TripDraft): number | undefined => {
  const a = draft.dateRange.start.trim();
  const b = draft.dateRange.end.trim();
  if (!a || !b) {
    return undefined;
  }
  const ms = new Date(b).getTime() - new Date(a).getTime();
  const days = Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
  return Number.isFinite(days) ? Math.max(1, days) : undefined;
};

const bucketTitles = (ctx: HomeSuggestionContext): string[] => [
  ...ctx.bucketList.rows.map((r) => r.title),
  ...ctx.bucketList.savedDestinations.map((d) => d.title),
  ...ctx.bucketList.savedActivities.map((a) => a.title),
];

/** Exported for Right now / other callers that already hold FlickSync rows. */
export const flickTitleSignalsForStoryLayer = (items: FlickSyncLibraryItem[] | undefined): string[] => {
  if (!items?.length) {
    return [];
  }
  const ranked = [...items].sort((a, b) => scoreFlickSyncLibraryInterest(b) - scoreFlickSyncLibraryInterest(a));
  return ranked
    .slice(0, 12)
    .map((i) => i.title.trim())
    .filter((t) => t.length >= 2);
};

export const storySuggestionsForHomeContext = (ctx: HomeSuggestionContext, prefs: UserPreferences | null): StoryTravelExperience[] => {
  const storyPrefs = mergeStoryTravelPreferences(prefs?.storyTravel);
  const dests: Array<{ city: string; country: string }> = [];
  for (const row of ctx.bucketList.savedDestinations) {
    if (row.city?.trim() && row.country?.trim()) {
      dests.push({ city: row.city.trim(), country: row.country.trim() });
    } else if (row.country?.trim()) {
      dests.push({ city: "", country: row.country.trim() });
    }
  }
  for (const h of ctx.tripHistory.slice(0, 4)) {
    for (const d of h.destinations) {
      if (d.city?.trim() && d.country?.trim()) {
        dests.push({ city: d.city.trim(), country: d.country.trim() });
      }
    }
  }
  if (dests.length === 0) {
    dests.push({ city: "London", country: "United Kingdom" }, { city: "Tokyo", country: "Japan" });
  }
  const flickLines = [...new Set([...ctx.flickSync.interestSignals, ...ctx.flickSync.topTitles])].slice(0, 14);
  const signals = buildUserSignalsFromFlickAndBucket({
    flickInterestSignals: flickLines,
    bucketTitles: bucketTitles(ctx),
    manualHints: [],
  });
  const input: StoryTravelMatchInput = {
    destinations: dests.slice(0, 12),
    travelStyles: ctx.travelBehavior?.categoryAffinity ? Object.keys(ctx.travelBehavior.categoryAffinity).slice(0, 8) : ["culture"],
    pace: ctx.travelBehavior?.executionStyle === "slow" ? "slow" : "balanced",
    userSignals: signals,
    preferenceProfile: ctx.preferenceProfile,
    storyPrefs,
    allowWeakForInspiration: true,
  };
  return findStoryTravelMatches(input);
};

export const storySuggestionsForTripDraft = (
  draft: TripDraft,
  prefs: UserPreferences | null,
): StoryTravelExperience[] => {
  const storyPrefs = mergeStoryTravelPreferences(prefs?.storyTravel);
  const dests = destinationsFromDraft(draft);
  if (dests.length === 0) {
    return [];
  }
  const signals = buildUserSignalsFromFlickAndBucket({
    flickInterestSignals: flickTitleSignalsForStoryLayer(draft.flickSyncLibraryItems),
    bucketTitles: (draft.bucketListConsideredForPlanning ?? []).map((i) => i.title),
    manualHints: draft.preferences.vibe,
  });
  const input: StoryTravelMatchInput = {
    destinations: dests,
    tripDurationDays: tripDurationFromDraft(draft),
    travelStyles: [...draft.preferences.vibe, ...draft.preferences.foodInterests],
    pace: draft.preferences.pace,
    userSignals: signals,
    preferenceProfile: prefs?.preferenceProfile ?? null,
    storyPrefs,
    wizardStoryLevel: draft.preferences.storyInspirationLevel ?? null,
  };
  return findStoryTravelMatches(input);
};

export const storySuggestionsForTripEntity = (trip: Trip, prefs: UserPreferences | null): StoryTravelExperience[] => {
  const storyPrefs = mergeStoryTravelPreferences(prefs?.storyTravel);
  const dests = destinationsFromTrip(trip);
  if (dests.length === 0) {
    return [];
  }
  const start = trip.dateRange.start;
  const end = trip.dateRange.end;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const days = Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
  const input: StoryTravelMatchInput = {
    destinations: dests,
    tripDurationDays: Number.isFinite(days) ? Math.max(1, days) : undefined,
    travelStyles: trip.preferences.vibe,
    pace: trip.preferences.pace,
    userSignals: buildUserSignalsFromFlickAndBucket({ flickInterestSignals: [], bucketTitles: [], manualHints: trip.preferences.vibe }),
    preferenceProfile: prefs?.preferenceProfile ?? null,
    storyPrefs,
    wizardStoryLevel: trip.preferences.storyInspirationLevel ?? null,
  };
  return findStoryTravelMatches(input);
};

export const storySuggestionsForRightNow = (input: {
  city: string;
  country: string;
  availableMinutes: number;
  flickInterestSignals: string[];
  prefs: UserPreferences | null;
}): StoryTravelExperience[] => {
  if (input.availableMinutes < 35) {
    return [];
  }
  const storyPrefs = mergeStoryTravelPreferences(input.prefs?.storyTravel);
  const signals = buildUserSignalsFromFlickAndBucket({
    flickInterestSignals: input.flickInterestSignals,
    bucketTitles: [],
    manualHints: [],
  });
  const matchInput: StoryTravelMatchInput = {
    destinations: [{ city: input.city.trim(), country: input.country.trim() }],
    tripDurationDays: 1,
    travelStyles: ["culture"],
    pace: "balanced",
    userSignals: signals,
    preferenceProfile: input.prefs?.preferenceProfile ?? null,
    storyPrefs,
  };
  const all = findStoryTravelMatches(matchInput);
  return all.filter((e) => {
    if (e.destinationFit === "weak") {
      return false;
    }
    const durOk =
      e.recommendedDuration === "quick_stop" ||
      (e.recommendedDuration === "half_day" && input.availableMinutes >= 90);
    if (!durOk) {
      return false;
    }
    if (input.availableMinutes < 55 && e.recommendedDuration !== "quick_stop") {
      return false;
    }
    return true;
  });
};
