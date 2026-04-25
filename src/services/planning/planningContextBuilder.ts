import dayjs from "dayjs";
import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";
import type { PlaceExperienceMemory, TravelPartyContext } from "../../entities/place-memory/model";
import type { TravelMemory } from "../../entities/travel-memory/model";
import type { Trip } from "../../entities/trip/model";
import type { UserPreferences } from "../../entities/user/model";
import { deriveFlickSyncStatuses, scoreFlickSyncLibraryInterest } from "../flicksync/flickSyncLibrarySignals";
import type { MusicPlanningSignals } from "../../integrations/music/musicTypes";
import { rankActivityWithMusicTaste } from "../personalization/music/musicTasteScoring";
import type { TripPlace } from "../places/placeTypes";
import { formatAvoidConstraintsForPlanningGuidance, mergePreferenceProfile } from "../preferences/preferenceConstraintsService";

export interface PlanningContextInput {
  /** @deprecated Prefer {@link PlanningContextInput.globalUserPreferences}. */
  userPreferences?: UserPreferences | null;
  /** Account-wide defaults (currency, etc.). Not merged from wizard-only trip fields. */
  globalUserPreferences?: UserPreferences | null;
  /** Wizard/session trip preferences (party, must-see, vibe). Omit to fall back to `draft.preferences`. */
  temporaryTripWizardPreferences?: Trip["preferences"] | null;
  travelMemories?: TravelMemory[];
  placeMemories?: PlaceExperienceMemory[];
  draft?: {
    preferences: Trip["preferences"];
    budget: Trip["budget"];
    mustSeePlaces?: TripPlace[];
  };
  /** FlickSync `profiles/{uid}/library` items; optional taste layer (same Firebase as WanderMint). */
  flickSyncLibraryItems?: FlickSyncLibraryItem[];
  /** Summarized music taste — optional; never mandatory for planning. */
  musicPlanningSignals?: MusicPlanningSignals | null;
}

export interface PlaceRecommendationSignal {
  scoreAdjustment: number;
  explanation?: string;
}

export interface PlanningContext {
  preferredCurrency?: string;
  partyContext: TravelPartyContext;
  explicitMustSeeMentions: string[];
  promptGuidance: string[];
  musicPlanningSignals?: MusicPlanningSignals | null;
  scorePlace: (place: { name: string; city?: string; country?: string }) => PlaceRecommendationSignal;
}

const normalize = (value: string | undefined): string => value?.trim().toLowerCase() ?? "";

const parsePartyContext = (value: Trip["preferences"]["partyComposition"]): TravelPartyContext =>
  value === "solo" || value === "couple" || value === "friends" || value === "family" ? value : "group";

const parseMustSeeMentions = (mustSeeNotes: string): string[] =>
  mustSeeNotes
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);

const mergeMustSeeMentionList = (structuredLabels: string[], fromNotes: string[]): string[] => {
  const raw = [...structuredLabels, ...fromNotes].map((s) => s.trim()).filter((s) => s.length >= 3);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
};

const recentlyVisited = (isoDate: string | undefined): boolean => {
  if (!isoDate) {
    return false;
  }
  const parsed = dayjs(isoDate);
  if (!parsed.isValid()) {
    return false;
  }
  return dayjs().diff(parsed, "day") <= 180;
};

export const buildPlanningContext = (input: PlanningContextInput): PlanningContext => {
  const globalPrefs = input.globalUserPreferences ?? input.userPreferences;
  const tempPrefs = input.temporaryTripWizardPreferences ?? input.draft?.preferences;
  const partyContext = parsePartyContext(tempPrefs?.partyComposition ?? "solo");
  const structuredMustSeeLabels = (input.draft?.mustSeePlaces ?? [])
    .map((place) => place.label.trim())
    .filter((item) => item.length >= 3);
  const mustSeeMentions = mergeMustSeeMentionList(structuredMustSeeLabels, parseMustSeeMentions(tempPrefs?.mustSeeNotes ?? ""));
  const placeMemories = input.placeMemories ?? [];
  const travelMemories = input.travelMemories ?? [];

  const promptGuidance: string[] = [];
  if (globalPrefs?.currency) {
    promptGuidance.push(`Use ${globalPrefs.currency} as the primary display currency for estimates and budget communication.`);
  }
  if (mustSeeMentions.length > 0) {
    promptGuidance.push("If a previously visited place appears in must-see notes or locked must-see picks, keep it and do not suppress it.");
  }
  promptGuidance.push("Do not hard-filter past places unless user explicitly marks them as avoid/dislike.");
  promptGuidance.push("Solo memories can still be recommended for non-solo trips when context changes.");

  const mergedPreferenceProfile = mergePreferenceProfile(globalPrefs?.preferenceProfile ?? null);
  const avoidPlanningLine = formatAvoidConstraintsForPlanningGuidance(mergedPreferenceProfile);
  if (avoidPlanningLine) {
    promptGuidance.push(avoidPlanningLine);
  }
  if (mergedPreferenceProfile.prefer.length > 0) {
    promptGuidance.push(
      `DESTINATION BIAS (soft — never overrides hard avoids): ${mergedPreferenceProfile.prefer.slice(0, 20).join("; ")}`,
    );
  }

  const flickItems = input.flickSyncLibraryItems ?? [];
  const musicSignals = input.musicPlanningSignals ?? null;
  if (musicSignals && musicSignals.topArtists.length + musicSignals.topGenres.length > 0) {
    promptGuidance.push(
      "Music taste is optional context only. Do not center the trip around music unless the user explicitly asks. You may include occasional music-related options when they naturally fit the destination. Max 1 music-inspired item per 2 travel days.",
    );
    promptGuidance.push(
      `Summarized music signals (artists · genres · scenes): ${musicSignals.topArtists.slice(0, 5).join(", ")} · ${musicSignals.topGenres.slice(0, 6).join(", ")} · ${musicSignals.scenes.slice(0, 4).join(" | ")}`,
    );
  }

  if (flickItems.length > 0) {
    promptGuidance.push(
      "FlickSync library rows live under profiles/{uid}/library. Interpret them only from isFavourite (following), isWishlisted (wishlist), consumed (watched for movie/tv, played for game), abandoned, and consumeCount — never treat externalRating as the user's own taste.",
    );
    const ranked = flickItems
      .map((item) => ({
        item,
        score: scoreFlickSyncLibraryInterest(item),
        statuses: deriveFlickSyncStatuses(item),
      }))
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 12);
    if (ranked.length > 0) {
      promptGuidance.push(
        `FlickSync-weighted media signals (title [derived signals, interest score]): ${ranked
          .map((row) => `${row.item.title} [${row.statuses.join("+")}, ${row.score}]`)
          .join(" · ")}.`,
      );
    }
  }

  const scorePlace = (place: { name: string; city?: string; country?: string }): PlaceRecommendationSignal => {
    const placeName = normalize(place.name);
    const city = normalize(place.city);
    const country = normalize(place.country);
    const musicBoost = Math.min(
      20,
      Math.round(rankActivityWithMusicTaste({ name: place.name, tags: [place.city ?? "", place.country ?? ""] }, musicSignals) * 100),
    );
    const musicNote =
      musicBoost > 0
        ? "softly boosted from optional summarized music taste (never overrides must-see, budget, dates, anchors, or accessibility)"
        : undefined;
    const mustSeeMatch = mustSeeMentions.some((mention) => placeName.includes(normalize(mention)));
    if (mustSeeMatch) {
      return {
        scoreAdjustment: 28 + musicBoost,
        explanation: ["recommended again because it is explicitly requested in must-see notes", musicNote].filter(Boolean).join(" · "),
      };
    }

    const placeMemory = placeMemories.find((memory) => {
      const byName = normalize(memory.placeName) === placeName || normalize(memory.placeName).includes(placeName);
      const cityMatch = !city || !memory.city || normalize(memory.city) === city;
      const countryMatch = !country || !memory.country || normalize(memory.country) === country;
      return byName && cityMatch && countryMatch;
    });

    if (placeMemory?.notInterested || (placeMemory?.skippedCount ?? 0) > 0) {
      return {
        scoreAdjustment: -85,
        explanation: "downranked because user disliked or skipped this place before",
      };
    }

    const samePartyVisits = placeMemory?.contextVisitCounts[partyContext] ?? 0;
    const soloVisits = placeMemory?.contextVisitCounts.solo ?? 0;
    if (samePartyVisits > 0 && recentlyVisited(placeMemory?.lastVisitedAt ?? undefined)) {
      return {
        scoreAdjustment: -26,
        explanation: "downranked because recently visited in the same trip context",
      };
    }

    if (partyContext !== "solo" && soloVisits > 0) {
      return {
        scoreAdjustment: 12 + musicBoost,
        explanation: ["recommended again because this is a different trip context", musicNote].filter(Boolean).join(" · "),
      };
    }

    const travelMemoryMatch = travelMemories.find((memory) =>
      normalize(memory.city) === city && normalize(memory.country) === country);
    if (travelMemoryMatch && recentlyVisited(travelMemoryMatch.endDate)) {
      return {
        scoreAdjustment: -12,
        explanation: "downranked because this destination was visited recently",
      };
    }

    return {
      scoreAdjustment: musicBoost,
      explanation: musicNote,
    };
  };

  return {
    preferredCurrency: globalPrefs?.currency,
    partyContext,
    explicitMustSeeMentions: mustSeeMentions,
    promptGuidance,
    musicPlanningSignals: musicSignals,
    scorePlace,
  };
};

