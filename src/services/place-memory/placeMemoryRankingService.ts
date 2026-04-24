import dayjs from "dayjs";
import type { ActivityBlock, PlaceSnapshot } from "../../entities/activity/model";
import type { FamiliarityMode, PlaceExperienceMemory, PlaceMemoryDisplayState, TravelPartyContext } from "../../entities/place-memory/model";
import { placeExperienceMemoryService } from "./placeExperienceMemoryService";

export interface PlaceMemoryScoringContext {
  currentCity?: string;
  currentCountry?: string;
  travelPartyContext: TravelPartyContext;
  familiarityMode: FamiliarityMode;
}

export interface PlaceMemorySignals {
  unseen: boolean;
  visitedOnce: boolean;
  visitedManyTimes: boolean;
  favorite: boolean;
  visitedRecently: boolean;
  notInterested: boolean;
  seenInThisCity: boolean;
  seenInThisRegion: boolean;
  repeatedExperienceCategory: boolean;
  iconicButRepeatable: boolean;
  visitedSameContext: boolean;
  visitedDifferentContext: boolean;
  visitedSoloBefore: boolean;
  showToOthersCandidate: boolean;
  favoriteRepeatable: boolean;
}

export interface PlaceMemoryScore {
  scoreAdjustment: number;
  signals: PlaceMemorySignals;
  displayState: PlaceMemoryDisplayState;
}

const normalizeToken = (value: string | undefined): string => value?.trim().toLowerCase() ?? "";

const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) {
    return null;
  }
  const timestamp = dayjs(iso);
  if (!timestamp.isValid()) {
    return null;
  }
  return Math.max(dayjs().diff(timestamp, "day"), 0);
};

const createEmptySignals = (): PlaceMemorySignals => ({
  unseen: true,
  visitedOnce: false,
  visitedManyTimes: false,
  favorite: false,
  visitedRecently: false,
  notInterested: false,
  seenInThisCity: false,
  seenInThisRegion: false,
  repeatedExperienceCategory: false,
  iconicButRepeatable: false,
  visitedSameContext: false,
  visitedDifferentContext: false,
  visitedSoloBefore: false,
  showToOthersCandidate: false,
  favoriteRepeatable: false,
});

const categoryFromPlace = (place: PlaceSnapshot, fallbackCategory?: string): string =>
  normalizeToken(fallbackCategory) || normalizeToken(place.name);

const isRepeatableLandmark = (memory: PlaceExperienceMemory | undefined, blockCategory?: string): boolean => {
  const tags = memory?.tags ?? [];
  const normalizedTags = tags.map(normalizeToken);
  return (
    normalizedTags.some((tag) => ["iconic", "landmark", "viewpoint", "scenic", "signature", "gallery", "museum", "attraction"].includes(tag)) ||
    ["landmark", "viewpoint", "gallery", "museum", "attraction", "culture", "walk"].includes(normalizeToken(blockCategory))
  );
};

export const placeMemoryRankingService = {
  getMemoryForPlace: (
    place: PlaceSnapshot | undefined,
    memoriesByKey: Record<string, PlaceExperienceMemory>,
    cityHint?: string,
    countryHint?: string,
  ): PlaceExperienceMemory | null => {
    if (!place) {
      return null;
    }

    const key = placeExperienceMemoryService.createPlaceKey(place, cityHint, countryHint);
    return memoriesByKey[key] ?? null;
  },

  scorePlace: (
    place: PlaceSnapshot | undefined,
    memory: PlaceExperienceMemory | null,
    options: PlaceMemoryScoringContext & { experienceCategory?: string },
  ): PlaceMemoryScore => {
    if (!place || !memory) {
      return {
        scoreAdjustment: 30 + (options.familiarityMode === "novelty" ? 8 : 0),
        signals: createEmptySignals(),
        displayState: { tone: "new", label: "new_for_you" },
      };
    }

    const sameCity = normalizeToken(memory.city) === normalizeToken(options.currentCity) && Boolean(memory.city);
    const sameCountry = normalizeToken(memory.country) === normalizeToken(options.currentCountry) && Boolean(memory.country);
    const currentContextCount = memory.contextVisitCounts[options.travelPartyContext] ?? 0;
    const visitedSameContext = currentContextCount > 0;
    const visitedDifferentContext = memory.visitCount > currentContextCount;
    const visitedSoloBefore = (memory.contextVisitCounts.solo ?? 0) > 0;
    const recentDays = daysSince(memory.lastVisitedAt);
    const visitedRecently = recentDays !== null && recentDays <= 60;
    const showToOthersCandidate = Boolean(memory.showToOthersCandidate || memory.isFavorite || isRepeatableLandmark(memory, options.experienceCategory));
    const favoriteRepeatable = Boolean(memory.isFavorite || showToOthersCandidate);
    const repeatedExperienceCategory = Boolean(memory.experienceCategory && normalizeToken(memory.experienceCategory) === normalizeToken(options.experienceCategory));

    let scoreAdjustment = 0;
    scoreAdjustment -= memory.visitCount >= 3 ? 26 : memory.visitCount === 2 ? 18 : 10;
    if (visitedSameContext) {
      scoreAdjustment -= 16;
    }
    if (sameCity) {
      scoreAdjustment -= 14;
    } else if (sameCountry) {
      scoreAdjustment -= 6;
    }
    if (visitedRecently) {
      scoreAdjustment -= 14;
    }
    if (repeatedExperienceCategory) {
      scoreAdjustment -= 10;
    }
    if (memory.notInterested) {
      scoreAdjustment -= 64;
    }

    if (memory.isFavorite) {
      scoreAdjustment += 18;
    }
    if (options.familiarityMode === "comfort" && favoriteRepeatable) {
      scoreAdjustment += 14;
    }
    if (options.familiarityMode === "novelty") {
      scoreAdjustment -= 8;
    }

    if (visitedDifferentContext) {
      scoreAdjustment += 8;
    }
    if (visitedSoloBefore && options.travelPartyContext !== "solo" && showToOthersCandidate) {
      scoreAdjustment += 16;
    }
    if (options.travelPartyContext !== "solo" && showToOthersCandidate) {
      scoreAdjustment += 8;
    }

    const displayState: PlaceMemoryDisplayState =
      memory.notInterested
        ? { tone: "avoid", label: "avoid_again" }
        : memory.isFavorite
          ? { tone: "favorite", label: "favorite" }
          : !sameCity && sameCountry
            ? { tone: "city_novel", label: "new_in_this_city_for_you" }
            : { tone: "seen", label: "been_there_before" };

    return {
      scoreAdjustment,
      signals: {
        unseen: false,
        visitedOnce: memory.visitCount === 1,
        visitedManyTimes: memory.visitCount >= 3,
        favorite: memory.isFavorite,
        visitedRecently,
        notInterested: Boolean(memory.notInterested),
        seenInThisCity: sameCity,
        seenInThisRegion: sameCountry,
        repeatedExperienceCategory,
        iconicButRepeatable: showToOthersCandidate,
        visitedSameContext,
        visitedDifferentContext,
        visitedSoloBefore,
        showToOthersCandidate,
        favoriteRepeatable,
      },
      displayState,
    };
  },

  scoreBlockNovelty: (
    block: ActivityBlock,
    memoriesByKey: Record<string, PlaceExperienceMemory>,
    options: PlaceMemoryScoringContext & { cityHint?: string; countryHint?: string },
  ): number => {
    const memory = placeMemoryRankingService.getMemoryForPlace(block.place, memoriesByKey, options.cityHint, options.countryHint);
    return placeMemoryRankingService.scorePlace(block.place, memory, {
      ...options,
      experienceCategory: block.category,
    }).scoreAdjustment;
  },

  summarizePlaceState: (
    place: PlaceSnapshot | undefined,
    memoriesByKey: Record<string, PlaceExperienceMemory>,
    options: PlaceMemoryScoringContext & { cityHint?: string; countryHint?: string; experienceCategory?: string },
  ): PlaceMemoryDisplayState | null => {
    if (!place) {
      return null;
    }
    const memory = placeMemoryRankingService.getMemoryForPlace(place, memoriesByKey, options.cityHint, options.countryHint);
    return placeMemoryRankingService.scorePlace(place, memory, options).displayState;
  },

  memorySignalsForPlace: (
    place: PlaceSnapshot | undefined,
    memoriesByKey: Record<string, PlaceExperienceMemory>,
    options: PlaceMemoryScoringContext & { cityHint?: string; countryHint?: string; experienceCategory?: string },
  ): PlaceMemorySignals => {
    if (!place) {
      return createEmptySignals();
    }
    const memory = placeMemoryRankingService.getMemoryForPlace(place, memoriesByKey, options.cityHint, options.countryHint);
    return placeMemoryRankingService.scorePlace(place, memory, options).signals;
  },

  inferCategoryKey: categoryFromPlace,
};
