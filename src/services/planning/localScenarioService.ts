import dayjs from "dayjs";
import type { ActivityAlternative, ActivityBlock, CostRange, PlaceSnapshot } from "../../entities/activity/model";
import type { PlaceExperienceMemory } from "../../entities/place-memory/model";
import type { TravelMemory } from "../../entities/travel-memory/model";
import type { RightNowExploreSpeed, UserPreferences } from "../../entities/user/model";
import type { FoodCultureLayer } from "../../entities/food-culture/model";
import type { FoodDrinkPlannerSettings } from "../../entities/food-culture/model";
import { createClientId } from "../../shared/lib/id";
import { NotEnoughGroundedDataError } from "../../shared/lib/appErrors";
import { debugLogError } from "../../shared/lib/errors";
import { openAiGatewayClient } from "../ai/openAiGatewayClient";
import {
  buildLocalScenarioPrompt,
  getRightNowBlockBounds,
  type LocalScenarioTimeContext,
  type RightNowSpendTier,
} from "../ai/promptBuilders/localScenarioPromptBuilder";
import { generatedLocalScenariosSchema, type GeneratedLocalScenarios } from "../ai/schemas";
import type { DestinationDiscovery, DiscoveryItem, RouteContext, WeatherContext } from "../providers/contracts";
import { publicDiscoveryProvider } from "../providers/publicDiscoveryProvider";
import { publicGeoProvider } from "../providers/publicGeoProvider";
import { publicPlacesProvider } from "../providers/publicPlacesProvider";
import { publicRoutingProvider } from "../providers/publicRoutingProvider";
import { publicWeatherProvider } from "../providers/publicWeatherProvider";
import { nowIso } from "../firebase/timestampMapper";
import { pricingService } from "../pricing/pricingService";
import { detectFoodCrawlIntent, optimizeItineraryBlocks, scoreItineraryComposition } from "./itineraryCompositionService";
import { movementPlanningService } from "./movementPlanningService";
import { openingHoursService } from "./openingHoursService";
import { sanitizeUserFacingDescription, sanitizeUserFacingLine } from "../../shared/lib/userFacingText";
import { buildPlanningContext } from "./planningContextBuilder";
import { buildMusicPlanningSignals, getEnabledMusicPersonalization } from "../personalization/music/musicPersonalizationService";
import type { MusicPlanningSignals } from "../../integrations/music/musicTypes";
import { mergeFoodDrinkPlannerSettings } from "../foodCulture/foodCultureDefaults";
import { buildFoodCultureLayer } from "../foodCulture/foodCultureLayerBuilder";
import { getOrBuildFoodCultureLayer } from "../foodCulture/foodCultureCache";
import { formatFoodCultureForRightNowPrompt } from "../foodCulture/foodCulturePromptForAi";
import { adjustFoodCandidateScores } from "../foodCulture/adjustFoodCandidateScores";
import { flickSyncLibraryRepository } from "../flicksync/flickSyncLibraryRepository";
import { formatStoryTravelPromptAppendix, refineStoryTravelExperiences } from "../storyTravel/storyTravelAiLayer";
import { flickTitleSignalsForStoryLayer, storySuggestionsForRightNow } from "../storyTravel/storyTravelSuggestionService";

interface LocalScenarioRequest {
  userId?: string;
  locationLabel: string;
  latitude?: number;
  longitude?: number;
  vibe: string;
  availableMinutes: number;
  /** Right-now spend posture: influences search weights and AI prompt. */
  rightNowSpendTier?: RightNowSpendTier;
  userPreferences?: UserPreferences | null;
  travelMemories?: TravelMemory[];
  placeMemories?: PlaceExperienceMemory[];
  /** Optional override; defaults to balanced planner + user avoids/interests. */
  foodDrinkPlanner?: FoodDrinkPlannerSettings | null;
}

const resolveExploreSpeed = (prefs?: UserPreferences | null): RightNowExploreSpeed => prefs?.rightNowExploreSpeed ?? "balanced";

type LocalScenarioProgressStep =
  | "locating_precisely"
  | "checking_weather"
  | "finding_nearby_places"
  | "estimating_movement"
  | "composing_scenarios"
  | "refining_with_ai"
  | "polishing_itinerary";

interface LocalScenarioGenerationHooks {
  onStep?: (step: LocalScenarioProgressStep) => void;
  onBatch?: (scenarios: GeneratedLocalScenarios["scenarios"], total: number) => Promise<void> | void;
}

const progressiveDelayMs = 120;

type CandidateKind = "cafe" | "culture" | "food" | "drinks" | "cinema" | "walk";

interface CandidatePlace {
  id: string;
  place: PlaceSnapshot;
  kind: CandidateKind;
  distanceMeters: number;
  relevanceScore: number;
}

interface LocalAreaContext {
  city?: string;
  country?: string;
  strictRadiusMeters: number;
  relaxedRadiusMeters: number;
}

interface LocalSearchStageResult {
  groundedPlaces: PlaceSnapshot[];
  rankedPools: Record<CandidateKind, CandidatePlace[]>;
}

const inferCategoriesFromVibe = (vibe: string, precipitationChance: number): string[] => {
  const normalized = vibe.toLowerCase();
  if (normalized.includes("cinema")) {
    return ["cinema", "food", "drinks"];
  }
  if (normalized.includes("rain") || precipitationChance >= 45) {
    return ["museum", "gallery", "cafe", "food", "cinema"];
  }
  if (normalized.includes("social")) {
    return ["cafe", "food", "drinks", "attraction"];
  }
  if (normalized.includes("date")) {
    return ["cafe", "food", "gallery", "attraction"];
  }
  if (normalized.includes("culture")) {
    return ["museum", "gallery", "attraction", "cafe"];
  }

  return ["cafe", "gallery", "food", "attraction"];
};

const createEmptyDiscovery = (locationLabel: string): DestinationDiscovery => ({
  locationLabel,
  capturedAt: nowIso(),
  attractions: [],
  museums: [],
  localFood: [],
  traditionalDrinks: [],
  nearbyPlaces: [],
  dayTrips: [],
  mustSee: [],
});

const wait = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const distanceMetersFromPoint = (latitude: number, longitude: number, place: PlaceSnapshot): number => {
  if (place.latitude === undefined || place.longitude === undefined) {
    return 9999;
  }

  const earthRadiusMeters = 6371000;
  const dLat = toRadians(place.latitude - latitude);
  const dLon = toRadians(place.longitude - longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(latitude)) * Math.cos(toRadians(place.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeToken = (value: string): string => value.trim().toLowerCase();

const isCoordinateLikeToken = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  return /^-?\d+(?:\.\d+)?$/.test(value.trim());
};

const parseLocationContext = (locationLabel: string, availableMinutes: number): LocalAreaContext => {
  const [cityRaw, countryRaw] = locationLabel.split(",").map((item) => item.trim());
  // Reverse-geocode fallback can be "lat, lng" — don't treat numeric tokens as city/country filters.
  const city = isCoordinateLikeToken(cityRaw) ? undefined : cityRaw;
  const country = isCoordinateLikeToken(countryRaw) ? undefined : countryRaw;
  return {
    city: city || undefined,
    country: country || undefined,
    strictRadiusMeters: availableMinutes <= 90 ? 2200 : availableMinutes <= 150 ? 3400 : 4800,
    relaxedRadiusMeters: availableMinutes <= 90 ? 3500 : availableMinutes <= 150 ? 5000 : 7000,
  };
};

const samePlaceArea = (left: string | undefined, right: string | undefined): boolean => {
  const normalizedLeft = normalizeToken(left ?? "");
  const normalizedRight = normalizeToken(right ?? "");
  if (!normalizedLeft || !normalizedRight) {
    return true;
  }
  return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
};

const isPlaceInsideLocalArea = (
  place: PlaceSnapshot,
  point: { latitude: number; longitude: number },
  context: LocalAreaContext,
  options: {
    radiusMeters: number;
    relaxCity: boolean;
  },
): boolean => {
  if (place.latitude === undefined || place.longitude === undefined) {
    return false;
  }

  if (distanceMetersFromPoint(point.latitude, point.longitude, place) > options.radiusMeters) {
    return false;
  }

  if (context.country && place.country && !samePlaceArea(place.country, context.country)) {
    return false;
  }

  if (!options.relaxCity && context.city && place.city && !samePlaceArea(place.city, context.city)) {
    return false;
  }

  return true;
};

const filterLocalPlaces = (
  places: PlaceSnapshot[],
  point: { latitude: number; longitude: number },
  context: LocalAreaContext,
  options: {
    radiusMeters: number;
    relaxCity: boolean;
  },
): PlaceSnapshot[] => places.filter((place) => isPlaceInsideLocalArea(place, point, context, options));

const vibeWeights = (vibe: string, spendTier?: RightNowSpendTier): Record<CandidateKind, number> => {
  const normalized = vibe.toLowerCase();

  let base: Record<CandidateKind, number>;
  if (normalized.includes("cinema")) {
    base = { cinema: 1.35, food: 1.2, cafe: 0.8, drinks: 0.95, culture: 0.45, walk: 0.6 };
  } else if (normalized.includes("rain")) {
    base = { culture: 1.25, cafe: 1.1, food: 1, drinks: 0.85, cinema: 1.1, walk: 0.2 };
  } else if (normalized.includes("social")) {
    base = { drinks: 1.25, food: 1.05, cafe: 1.1, culture: 0.7, cinema: 0.65, walk: 0.8 };
  } else if (normalized.includes("date")) {
    base = { cafe: 1.2, food: 1.15, culture: 1, drinks: 1.05, cinema: 0.7, walk: 0.95 };
  } else if (normalized.includes("culture")) {
    base = { culture: 1.35, walk: 1.1, cafe: 0.9, food: 0.75, drinks: 0.55, cinema: 0.45 };
  } else {
    base = { cafe: 1.2, culture: 1.1, walk: 1.05, food: 0.95, drinks: 0.65, cinema: 0.5 };
  }

  if (spendTier === "free") {
    return {
      ...base,
      walk: base.walk * 1.55,
      culture: base.culture * 1.12,
      cafe: base.cafe * 0.72,
      drinks: base.drinks * 0.22,
      food: base.food * 0.82,
      cinema: base.cinema * 0.55,
    };
  }
  if (spendTier === "low") {
    return {
      ...base,
      walk: base.walk * 1.28,
      drinks: base.drinks * 0.58,
      cinema: base.cinema * 0.82,
    };
  }
  return base;
};

const categoryBundlesForVibe = (vibe: string, spendTier?: RightNowSpendTier): Array<{ kind: CandidateKind; categories: string[] }> => {
  const normalized = vibe.toLowerCase();
  const baseBundles: Array<{ kind: CandidateKind; categories: string[] }> = [
    { kind: "cafe", categories: ["cafe"] },
    { kind: "culture", categories: ["gallery", "museum"] },
    { kind: "food", categories: ["food", "local_food"] },
    { kind: "walk", categories: ["attraction"] },
  ];

  let bundles: Array<{ kind: CandidateKind; categories: string[] }>;
  if (normalized.includes("cinema")) {
    bundles = [{ kind: "cinema", categories: ["cinema"] }, { kind: "food", categories: ["food"] }, { kind: "walk", categories: ["attraction"] }, { kind: "drinks", categories: ["drinks"] }];
  } else if (normalized.includes("rain")) {
    bundles = [{ kind: "culture", categories: ["museum", "gallery"] }, { kind: "cafe", categories: ["cafe"] }, { kind: "food", categories: ["food"] }, { kind: "cinema", categories: ["cinema"] }];
  } else if (normalized.includes("social")) {
    bundles = [{ kind: "drinks", categories: ["drinks"] }, { kind: "food", categories: ["food"] }, { kind: "cafe", categories: ["cafe"] }, { kind: "walk", categories: ["attraction"] }];
  } else if (normalized.includes("date")) {
    bundles = [{ kind: "cafe", categories: ["cafe"] }, { kind: "culture", categories: ["gallery", "museum"] }, { kind: "food", categories: ["food"] }, { kind: "walk", categories: ["attraction"] }];
  } else {
    bundles = baseBundles;
  }

  if (spendTier === "free") {
    const lean = bundles.filter((b) => b.kind !== "drinks" && b.kind !== "cinema");
    const walks = lean.filter((b) => b.kind === "walk");
    const rest = lean.filter((b) => b.kind !== "walk");
    return [...walks, ...rest];
  }
  if (spendTier === "low") {
    const walk = bundles.find((b) => b.kind === "walk");
    const others = bundles.filter((b) => b.kind !== "walk");
    return walk ? [walk, ...others] : bundles;
  }
  return bundles;
};

const uniquePlaces = (places: PlaceSnapshot[]): PlaceSnapshot[] => {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = `${place.provider}:${place.providerPlaceId ?? place.name.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const uniqueScenarios = (scenarios: GeneratedLocalScenarios["scenarios"]): GeneratedLocalScenarios["scenarios"] => {
  const seen = new Set<string>();
  return scenarios.filter((scenario) => {
    const key = normalizeToken(`${scenario.theme}|${scenario.blocks.map((block) => block.place?.name ?? block.title).join("|")}`);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const discoveryPlaces = (discovery: DestinationDiscovery): PlaceSnapshot[] =>
  uniquePlaces(
    [
      ...discovery.attractions,
      ...discovery.museums,
      ...discovery.localFood,
      ...discovery.traditionalDrinks,
      ...discovery.nearbyPlaces,
      ...discovery.dayTrips,
    ]
      .map((item) => item.place)
      .filter((place): place is PlaceSnapshot => Boolean(place)),
  );

const fallbackRoute = (placeCount: number): RouteContext => ({
  summary: placeCount > 1
    ? "Everything stays in a short nearby loop, so it feels easy to follow without rushing."
    : "A short nearby plan built around one strong stop and room to keep it flexible.",
  walkingMinutes: Math.max(10, placeCount * 12),
  certainty: "partial",
});

const fallbackWeather = (locationLabel: string): WeatherContext => ({
  locationLabel,
  temperatureC: 18,
  condition: "Variable conditions",
  precipitationChance: 20,
  windKph: 10,
  observedAt: nowIso(),
  certainty: "partial",
});

const blockCost = (
  type: ActivityBlock["type"],
  category: string,
  locationLabel: string,
  place?: PlaceSnapshot,
): CostRange =>
  pricingService.estimateActivityCost({
    type,
    category,
    place,
    locationLabel,
    budgetStyle: "balanced",
  });

const createBlockAlternatives = (alternatives: PlaceSnapshot[], locationLabel: string): ActivityAlternative[] =>
  alternatives.slice(0, 2).map((place) => ({
    id: createClientId("alt"),
    title: place.name,
    reason: "A nearby swap if you want the same mood with a slightly different stop.",
    estimatedCost: pricingService.estimateActivityCost({
      type: "activity",
      category: "alternative",
      place,
      locationLabel,
      budgetStyle: "balanced",
    }),
    place,
  }));

const createActivityBlock = (
  type: ActivityBlock["type"],
  title: string,
  description: string,
  startTime: string,
  endTime: string,
  category: string,
  indoorOutdoor: ActivityBlock["indoorOutdoor"],
  locationLabel: string,
  place?: PlaceSnapshot,
  alternativePlaces: PlaceSnapshot[] = [],
): ActivityBlock => ({
  id: createClientId("block"),
  type,
  title,
  description,
  startTime,
  endTime,
  place,
  category,
  tags: [category, indoorOutdoor, "grounded"],
  indoorOutdoor,
  estimatedCost: blockCost(type, category, locationLabel, place),
  dependencies: {
    weatherSensitive: indoorOutdoor === "outdoor",
    bookingRequired: false,
    openingHoursSensitive: Boolean(place?.openingHoursLabel),
    priceSensitive: true,
  },
  alternatives: createBlockAlternatives(alternativePlaces, locationLabel),
  sourceSnapshots: place ? [place] : [],
  priority: type === "meal" ? "should" : "must",
  locked: false,
  completionStatus: "pending",
});

const createTimeWindows = (availableMinutes: number, blockCount: number): Array<{ start: string; end: string }> => {
  const base = dayjs().startOf("minute").add(15 - (dayjs().minute() % 15 || 15), "minute");
  const perBlockMinutes = Math.max(15, Math.floor(availableMinutes / blockCount));

  return Array.from({ length: blockCount }, (_, index) => {
    const start = base.add(index * perBlockMinutes, "minute");
    const end = index === blockCount - 1 ? base.add(availableMinutes, "minute") : start.add(perBlockMinutes, "minute");
    return { start: start.format("HH:mm"), end: end.format("HH:mm") };
  });
};

const weatherFit = (weather: WeatherContext, usesIndoorPlan: boolean): "excellent" | "good" | "risky" | "indoor" => {
  if (usesIndoorPlan || weather.precipitationChance >= 55) {
    return "indoor";
  }
  if (weather.precipitationChance <= 18) {
    return "excellent";
  }
  if (weather.precipitationChance <= 42) {
    return "good";
  }
  return "risky";
};

const describePlace = (place: PlaceSnapshot | undefined, fallbackTitle: string): string =>
  place
    ? sanitizeUserFacingDescription(
        `${fallbackTitle} at ${place.name}${
          openingHoursService.getOpeningHoursFit(place.openingHoursLabel, dayjs().format("YYYY-MM-DD"), "12:00", "12:30") === "open"
            ? ", and the timing fits this stop."
            : "."
        }`,
      )
    : `${fallbackTitle} with enough flexibility to follow how the moment feels.`;

const themedTitle = (vibe: string, index: number): string => {
  const normalized = vibe.toLowerCase();
  if (normalized.includes("cinema")) {
    return ["Screen and sweet finish", "Low-light city pause", "Evening reel nearby"][index] ?? "Nearby evening plan";
  }
  if (normalized.includes("rain")) {
    return ["Sheltered city arc", "Rain-proof culture pocket", "Indoor evening drift"][index] ?? "Indoor nearby plan";
  }
  if (normalized.includes("date")) {
    return ["Soft-lit nearby date", "Local date sequence", "Golden-hour nearby plan"][index] ?? "Nearby date idea";
  }
  if (normalized.includes("culture")) {
    return ["Culture pocket route", "Short art and city loop", "Compact museum drift"][index] ?? "Cultural nearby plan";
  }

  return ["Slow city reset", "Neighbourhood wander line", "Easy local sequence"][index] ?? "Nearby local plan";
};

const scenarioAlternatives = (items: Array<PlaceSnapshot | DiscoveryItem>): string[] =>
  items.slice(0, 3).map((item) => "name" in item ? item.name : item.title);

const totalCost = (blocks: ActivityBlock[]): CostRange => pricingService.sumCosts(blocks);

const humanRouteSummary = (distanceMeters: number, route: RouteContext): string => {
  const roundedMinutes = Math.max(6, Math.round(route.walkingMinutes / 5) * 5);
  if (distanceMeters <= 450) {
    return `The first stop is very close, and the whole flow stays easy to walk in about ${roundedMinutes} minutes total.`;
  }
  if (distanceMeters <= 1100) {
    return `The route stays nearby and should feel comfortable on foot, with about ${roundedMinutes} minutes of movement in total.`;
  }
  return `This one reaches a little farther, but the movement still fits into a manageable ${roundedMinutes}-minute loop.`;
};

const composeScenarioRouteLogic = (distanceMeters: number, route: RouteContext, compositionSummary: string): string =>
  `${humanRouteSummary(distanceMeters, route)} ${compositionSummary}`;

const attachMovementLegs = async (
  scenarios: GeneratedLocalScenarios["scenarios"],
): Promise<GeneratedLocalScenarios["scenarios"]> =>
  Promise.all(
    scenarios.map(async (scenario) => ({
      ...scenario,
      movementLegs: await movementPlanningService.buildMovementLegs(scenario.blocks),
    })),
  );

const chooseIndoorOutdoor = (kind: CandidateKind, precipitationChance: number): ActivityBlock["indoorOutdoor"] => {
  if (kind === "walk") {
    return precipitationChance >= 45 ? "mixed" : "outdoor";
  }
  if (kind === "culture" || kind === "cinema" || kind === "cafe") {
    return "indoor";
  }
  return "mixed";
};

const titleForKind = (kind: CandidateKind, fallbackName: string): string => {
  if (kind === "cafe") {
    return fallbackName;
  }
  if (kind === "food") {
    return fallbackName;
  }
  if (kind === "drinks") {
    return fallbackName;
  }
  if (kind === "cinema") {
    return fallbackName;
  }
  if (kind === "culture") {
    return fallbackName;
  }

  return fallbackName;
};

const descriptionForKind = (kind: CandidateKind, place: PlaceSnapshot | undefined): string => {
  if (kind === "cafe") {
    return describePlace(place, "Start with a calm coffee stop");
  }
  if (kind === "food") {
    return describePlace(place, "Pause for something good to eat nearby");
  }
  if (kind === "drinks") {
    return describePlace(place, "Ease into a social stop nearby");
  }
  if (kind === "cinema") {
    return describePlace(place, "Settle into a nearby cinema break");
  }
  if (kind === "culture") {
    return describePlace(place, "Fold in a nearby cultural stop");
  }

  return describePlace(place, "Keep a little open-air breathing room in the plan");
};

const blockTypeForKind = (kind: CandidateKind): ActivityBlock["type"] => {
  if (kind === "food" || kind === "drinks" || kind === "cafe") {
    return "meal";
  }

  return "activity";
};

const categoryForKind = (kind: CandidateKind): string => {
  if (kind === "walk") {
    return "walk";
  }
  return kind;
};

const padBlueprintRow = (row: CandidateKind[], targetLength: number): CandidateKind[] => {
  if (targetLength <= 0) {
    return [];
  }
  if (row.length >= targetLength) {
    return row.slice(0, targetLength);
  }

  const fillers: CandidateKind[] = ["walk", "cafe", "culture", "food", "drinks"];
  const out = [...row];
  let index = 0;
  while (out.length < targetLength && index < 40) {
    const next = fillers[index % fillers.length] ?? "walk";
    if (out[out.length - 1] !== next) {
      out.push(next);
    }
    index += 1;
  }

  return out.slice(0, targetLength);
};

const baseBlueprintKindsForVibe = (vibe: string, availableMinutes: number): CandidateKind[][] => {
  const normalized = vibe.toLowerCase();
  const longFlow = availableMinutes >= 120;

  if (normalized.includes("cinema")) {
    return longFlow
      ? [["cinema", "food", "walk"], ["food", "cinema", "drinks"], ["cinema", "drinks", "food"]]
      : [["cinema", "food"], ["food", "cinema"], ["cinema", "drinks"]];
  }
  if (normalized.includes("rain")) {
    return longFlow
      ? [["culture", "cafe", "food"], ["cafe", "culture", "cinema"], ["culture", "food", "cafe"]]
      : [["culture", "cafe"], ["cafe", "culture"], ["cinema", "food"]];
  }
  if (normalized.includes("social")) {
    return longFlow
      ? [["cafe", "food", "drinks"], ["food", "drinks", "walk"], ["cafe", "drinks", "food"]]
      : [["cafe", "drinks"], ["food", "drinks"], ["cafe", "food"]];
  }
  if (normalized.includes("date")) {
    return longFlow
      ? [["cafe", "culture", "food"], ["food", "walk", "drinks"], ["cafe", "walk", "food"]]
      : [["cafe", "food"], ["cafe", "culture"], ["food", "walk"]];
  }
  if (normalized.includes("culture")) {
    return longFlow
      ? [["culture", "walk", "cafe"], ["culture", "culture", "food"], ["walk", "culture", "cafe"]]
      : [["culture", "walk"], ["culture", "cafe"], ["walk", "culture"]];
  }

  return longFlow
    ? [["cafe", "culture", "walk"], ["food", "walk", "cafe"], ["cafe", "food", "culture"]]
    : [["cafe", "walk"], ["cafe", "culture"], ["food", "walk"]];
};

const blueprintKindsForVibe = (vibe: string, availableMinutes: number, maxStops: number): CandidateKind[][] => {
  const base = baseBlueprintKindsForVibe(vibe, availableMinutes);
  const engineCap = Math.min(6, Math.max(1, maxStops));
  return base.map((row) => padBlueprintRow(row, engineCap));
};

const candidateScore = (candidate: CandidatePlace): number => candidate.relevanceScore * 100 - candidate.distanceMeters / 35;

const buildCandidatePools = (
  point: { latitude: number; longitude: number },
  vibe: string,
  bundledPlaces: Array<{ kind: CandidateKind; places: PlaceSnapshot[] }>,
  discovery: DestinationDiscovery,
  spendTier?: RightNowSpendTier,
): Record<CandidateKind, CandidatePlace[]> => {
  const weights = vibeWeights(vibe, spendTier);
  const pools: Record<CandidateKind, CandidatePlace[]> = {
    cafe: [],
    culture: [],
    food: [],
    drinks: [],
    cinema: [],
    walk: [],
  };

  bundledPlaces.forEach((bundle) => {
    bundle.places.forEach((place) => {
      pools[bundle.kind].push({
        id: `${bundle.kind}-${place.providerPlaceId ?? place.name}`,
        place,
        kind: bundle.kind,
        distanceMeters: distanceMetersFromPoint(point.latitude, point.longitude, place),
        relevanceScore: weights[bundle.kind],
      });
    });
  });

  discovery.nearbyPlaces.forEach((item) => {
    if (item.place) {
      pools.walk.push({
        id: `nearby-${item.id}`,
        place: item.place,
        kind: "walk",
        distanceMeters: distanceMetersFromPoint(point.latitude, point.longitude, item.place),
        relevanceScore: weights.walk,
      });
    }
  });

  discovery.localFood.forEach((item) => {
    if (item.place) {
      pools.food.push({
        id: `food-${item.id}`,
        place: item.place,
        kind: "food",
        distanceMeters: distanceMetersFromPoint(point.latitude, point.longitude, item.place),
        relevanceScore: weights.food,
      });
    }
  });

  discovery.traditionalDrinks.forEach((item) => {
    if (item.place) {
      pools.drinks.push({
        id: `drink-${item.id}`,
        place: item.place,
        kind: "drinks",
        distanceMeters: distanceMetersFromPoint(point.latitude, point.longitude, item.place),
        relevanceScore: weights.drinks,
      });
    }
  });

  discovery.museums.forEach((item) => {
    if (item.place) {
      pools.culture.push({
        id: `culture-${item.id}`,
        place: item.place,
        kind: "culture",
        distanceMeters: distanceMetersFromPoint(point.latitude, point.longitude, item.place),
        relevanceScore: weights.culture,
      });
    }
  });

  return {
    cafe: uniqueByCandidate(pools.cafe),
    culture: uniqueByCandidate(pools.culture),
    food: uniqueByCandidate(pools.food),
    drinks: uniqueByCandidate(pools.drinks),
    cinema: uniqueByCandidate(pools.cinema),
    walk: uniqueByCandidate(pools.walk),
  };
};

const uniqueByCandidate = (candidates: CandidatePlace[]): CandidatePlace[] => {
  const seen = new Set<string>();
  return candidates
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .filter((candidate) => {
      const key = normalizeToken(candidate.place.providerPlaceId ?? candidate.place.name);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const chooseCandidate = (
  pool: CandidatePlace[],
  usedPlaceNames: Set<string>,
  offset: number,
  date: string,
  startTime: string,
  endTime: string,
): CandidatePlace | null => {
  const available = pool.filter((candidate) => !usedPlaceNames.has(normalizeToken(candidate.place.name)));
  const openCandidates = available.filter((candidate) => openingHoursService.getOpeningHoursFit(candidate.place.openingHoursLabel, date, startTime, endTime) === "open");
  if (openCandidates.length > 0) {
    return openCandidates[offset] ?? openCandidates[0] ?? null;
  }

  const unknownCandidates = available.filter((candidate) => openingHoursService.getOpeningHoursFit(candidate.place.openingHoursLabel, date, startTime, endTime) === "unknown");
  return unknownCandidates[offset] ?? unknownCandidates[0] ?? null;
};

const themeFromKinds = (vibe: string, kinds: CandidateKind[], places: PlaceSnapshot[]): string => {
  const normalized = vibe.toLowerCase();
  const placeNames = places.slice(0, 2).map((place) => place.name.split(",")[0]).join(" and ");

  if (normalized.includes("cinema")) {
    return `A nearby screen-and-sweet run${placeNames ? ` via ${placeNames}` : ""}`;
  }
  if (normalized.includes("rain")) {
    return `An easy indoor pocket${placeNames ? ` around ${placeNames}` : ""}`;
  }
  if (normalized.includes("date")) {
    return `A soft nearby date flow${placeNames ? ` with ${placeNames}` : ""}`;
  }
  if (normalized.includes("culture")) {
    return `A short cultural drift${placeNames ? ` through ${placeNames}` : ""}`;
  }
  if (kinds.includes("drinks")) {
    return `A social nearby evening${placeNames ? ` near ${placeNames}` : ""}`;
  }

  return `A nearby city reset${placeNames ? ` around ${placeNames}` : ""}`;
};

const buildRankedScenarios = (
  request: LocalScenarioRequest,
  point: { latitude: number; longitude: number; label: string },
  localArea: LocalAreaContext,
  weather: WeatherContext,
  candidatePools: Record<CandidateKind, CandidatePlace[]>,
  route: RouteContext,
  discovery: DestinationDiscovery,
  planningContext: ReturnType<typeof buildPlanningContext>,
  foodCultureLayer: FoodCultureLayer | null,
): GeneratedLocalScenarios["scenarios"] => {
  const usesIndoorPlan = weather.precipitationChance >= 45 || request.vibe.toLowerCase().includes("rain");
  const mustSeeHints = discovery.mustSee;
  const exploreBounds = getRightNowBlockBounds(request.availableMinutes, resolveExploreSpeed(request.userPreferences));
  const blueprints = blueprintKindsForVibe(request.vibe, request.availableMinutes, exploreBounds.max);
  const allowFoodCrawl = detectFoodCrawlIntent(request.vibe);
  const scenarioDate = dayjs().format("YYYY-MM-DD");
  const rankedScenarios: Array<GeneratedLocalScenarios["scenarios"][number] & { rankingScore: number }> = [];

  for (const blueprint of blueprints) {
    for (let offset = 0; offset < 8; offset += 1) {
      const pickWindows = createTimeWindows(request.availableMinutes, blueprint.length);
      const usedPlaceNames = new Set<string>();
      const rawCandidates = blueprint
        .map((kind, index) =>
          chooseCandidate(
            candidatePools[kind],
            usedPlaceNames,
            Math.min(offset + index, 5),
            scenarioDate,
            pickWindows[index]?.start ?? "18:00",
            pickWindows[index]?.end ?? "18:45",
          ),
        )
        .filter((candidate): candidate is CandidatePlace => Boolean(candidate));

      rawCandidates.forEach((candidate) => {
        usedPlaceNames.add(normalizeToken(candidate.place.name));
      });

      const candidates = rawCandidates.slice(0, exploreBounds.max);
      if (candidates.length < exploreBounds.min) {
        continue;
      }

      const windows = createTimeWindows(request.availableMinutes, candidates.length);

      const provisionalBlocks = candidates.map((candidate, index) =>
        createActivityBlock(
          blockTypeForKind(candidate.kind),
          titleForKind(candidate.kind, candidate.place.name),
          descriptionForKind(candidate.kind, candidate.place),
          windows[index]?.start ?? "18:00",
          windows[index]?.end ?? "18:45",
          categoryForKind(candidate.kind),
          chooseIndoorOutdoor(candidate.kind, weather.precipitationChance),
          point.label,
          candidate.place,
          candidatePools[candidate.kind]
            .map((poolCandidate) => poolCandidate.place)
            .filter((place) => normalizeToken(place.name) !== normalizeToken(candidate.place.name))
            .filter((place) => openingHoursService.getOpeningHoursFit(place.openingHoursLabel, scenarioDate, windows[index]?.start ?? "18:00", windows[index]?.end ?? "18:45") !== "closed"),
        ),
      );
      const optimized = optimizeItineraryBlocks(provisionalBlocks, {
        origin: { latitude: point.latitude, longitude: point.longitude },
        allowFoodCrawl,
        preserveAnchors: false,
      });
      const blocks = optimized.blocks;
      const contextualBlocks = blocks.map((block) => {
        const signal = planningContext.scorePlace({
          name: block.place?.name ?? block.title,
          city: block.place?.city,
          country: block.place?.country,
        });
        if (!signal.explanation) {
          return block;
        }
        return {
          ...block,
          description: `${block.description}${block.description ? " " : ""}Source note: ${signal.explanation}.`,
        };
      });

      const averageDistance = candidates.reduce((sum, candidate) => sum + candidate.distanceMeters, 0) / candidates.length;
      const rankingScore =
        candidates.reduce((sum, candidate) => sum + candidateScore(candidate), 0) -
        averageDistance / 80 +
        optimized.metrics.score;

      const teaser =
        foodCultureLayer && foodCultureLayer.summary.trim().length > 0
          ? sanitizeUserFacingLine(
              foodCultureLayer.summary.length > 180 ? `${foodCultureLayer.summary.slice(0, 177)}…` : foodCultureLayer.summary,
            )
          : undefined;

      rankedScenarios.push({
        id: createClientId("scenario"),
        userId: request.userId,
        theme: sanitizeUserFacingLine(themeFromKinds(request.vibe, blueprint, candidates.map((candidate) => candidate.place))),
        locationLabel: point.label,
        estimatedDurationMinutes: request.availableMinutes,
        estimatedCostRange: totalCost(contextualBlocks),
        weatherFit: weatherFit(weather, usesIndoorPlan),
        routeLogic: sanitizeUserFacingDescription(composeScenarioRouteLogic(averageDistance, route, optimized.metrics.summary)),
        blocks: contextualBlocks,
        foodCultureTeaser: teaser,
        alternatives: [
          ...scenarioAlternatives(discoveryPlaces(discovery)),
          ...scenarioAlternatives(mustSeeHints),
        ].filter((item, index, values) => values.indexOf(item) === index).slice(0, 4),
        createdAt: nowIso(),
        rankingScore,
      });
    }
  }

  const scenarios = uniqueScenarios(
    rankedScenarios
      .sort((left, right) => right.rankingScore - left.rankingScore)
      .slice(0, 16)
      .map(({ rankingScore: _rankingScore, ...scenario }) => scenario)
      .filter((scenario) =>
        scenario.blocks.every((block) =>
          Boolean(block.place) &&
          isPlaceInsideLocalArea(block.place as PlaceSnapshot, point, localArea, {
            radiusMeters: localArea.relaxedRadiusMeters,
            relaxCity: false,
          })),
      ),
  );

  return scenarios;
};

const searchBundledPlaces = async (
  point: { latitude: number; longitude: number; label: string },
  request: LocalScenarioRequest,
  weather: WeatherContext,
  categoryBundles: Array<{ kind: CandidateKind; categories: string[] }>,
  localArea: LocalAreaContext,
  options: {
    radiusMeters: number;
    relaxCity: boolean;
  },
): Promise<Array<{ kind: CandidateKind; places: PlaceSnapshot[] }>> =>
  Promise.all(
    categoryBundles.map(async (bundle) => ({
      kind: bundle.kind,
      places: filterLocalPlaces(
        await publicPlacesProvider.searchPlaces({
          locationLabel: point.label,
          latitude: point.latitude,
          longitude: point.longitude,
          query: request.vibe,
          categories: bundle.categories,
          indoorPreferred: weather.precipitationChance > 45,
          radiusMeters: options.radiusMeters,
        }).catch(() => []),
        point,
        localArea,
        options,
      ),
    })),
  );

const buildStageResult = (
  point: { latitude: number; longitude: number },
  vibe: string,
  bundledPlaces: Array<{ kind: CandidateKind; places: PlaceSnapshot[] }>,
  discovery: DestinationDiscovery,
  groundedPlaces: PlaceSnapshot[],
  spendTier: RightNowSpendTier | undefined,
  foodCtx: {
    planner: FoodDrinkPlannerSettings;
    city: string;
    country: string;
    foodInterests: string[];
    avoids: string[];
  },
): LocalSearchStageResult => {
  const layer = getOrBuildFoodCultureLayer({
    city: foodCtx.city,
    country: foodCtx.country,
    planner: foodCtx.planner,
    foodInterests: foodCtx.foodInterests,
    avoids: foodCtx.avoids,
    build: () => buildFoodCultureLayer({ city: foodCtx.city, country: foodCtx.country, planner: foodCtx.planner }),
  });
  const rawPools = buildCandidatePools(point, vibe, bundledPlaces, discovery, spendTier);
  return {
    groundedPlaces: uniquePlaces(groundedPlaces).slice(0, 24),
    rankedPools: {
      ...rawPools,
      food: adjustFoodCandidateScores(rawPools.food, layer, foodCtx.planner, foodCtx.foodInterests, foodCtx.avoids),
      drinks: adjustFoodCandidateScores(rawPools.drinks, layer, foodCtx.planner, foodCtx.foodInterests, foodCtx.avoids),
      cafe: adjustFoodCandidateScores(rawPools.cafe, layer, foodCtx.planner, foodCtx.foodInterests, foodCtx.avoids),
    },
  };
};

export const localScenarioService = {
  generateScenarios: async (request: LocalScenarioRequest, hooks?: LocalScenarioGenerationHooks): Promise<GeneratedLocalScenarios> => {
    let musicPlanningSignals: MusicPlanningSignals | null = null;
    if (request.userId?.trim()) {
      try {
        const mp = await getEnabledMusicPersonalization(request.userId);
        const v = request.vibe.toLowerCase();
        const compatible =
          v.includes("night") ||
          v.includes("culture") ||
          v.includes("bar") ||
          v.includes("live") ||
          v.includes("food") ||
          v.includes("social") ||
          v.includes("rest") ||
          v.includes("date");
        if (compatible && mp.profile && mp.settings.useMusicTastePersonalization) {
          musicPlanningSignals = await buildMusicPlanningSignals(
            mp.profile,
            mp.planningConfidence,
            mp.settings.allowAiMusicInterpretation,
          );
        }
      } catch {
        /* optional */
      }
    }
    const planningContext = buildPlanningContext({
      userPreferences: request.userPreferences,
      travelMemories: request.travelMemories,
      placeMemories: request.placeMemories,
      draft: {
        preferences: {
          partyComposition: "solo",
          vibe: [request.vibe],
          foodInterests: request.userPreferences?.foodInterests ?? [],
          walkingTolerance: request.userPreferences?.walkingTolerance ?? "medium",
          pace: request.userPreferences?.preferredPace ?? "balanced",
          avoids: request.userPreferences?.avoids ?? [],
          mustSeeNotes: "",
          specialWishes: "",
          foodDrinkPlanner: mergeFoodDrinkPlannerSettings(request.foodDrinkPlanner ?? undefined),
        },
        budget: {
          amount: 0,
          style: "balanced",
          currency: request.userPreferences?.currency ?? "EUR",
        },
      },
      musicPlanningSignals,
    });
    hooks?.onStep?.("locating_precisely");
    const point = request.latitude !== undefined && request.longitude !== undefined
      ? { latitude: request.latitude, longitude: request.longitude, label: request.locationLabel }
      : await publicGeoProvider.geocode(request.locationLabel);

    hooks?.onStep?.("checking_weather");
    const weather = await publicWeatherProvider.getCurrentWeatherAt(point).catch(() => fallbackWeather(point.label));
    const localArea = parseLocationContext(point.label, request.availableMinutes);
    const planner = mergeFoodDrinkPlannerSettings(request.foodDrinkPlanner ?? undefined);
    const foodCtx = {
      planner,
      city: localArea.city ?? point.label.split(",")[0]?.trim() ?? "",
      country: localArea.country ?? point.label.split(",")[1]?.trim() ?? "",
      foodInterests: request.userPreferences?.foodInterests ?? [],
      avoids: request.userPreferences?.avoids ?? [],
    };
    const rightNowFoodLayer = getOrBuildFoodCultureLayer({
      city: foodCtx.city,
      country: foodCtx.country,
      planner: foodCtx.planner,
      foodInterests: foodCtx.foodInterests,
      avoids: foodCtx.avoids,
      build: () => buildFoodCultureLayer({ city: foodCtx.city, country: foodCtx.country, planner: foodCtx.planner }),
    });

    hooks?.onStep?.("finding_nearby_places");
    const spendTier = request.rightNowSpendTier ?? "flexible";
    const categoryBundles = categoryBundlesForVibe(request.vibe, spendTier);
    const discovery = await publicDiscoveryProvider.getDestinationDiscovery({
      locationLabel: point.label,
      segments: [{ city: point.label.split(",")[0] ?? point.label, country: point.label.split(",")[1]?.trim() ?? "" }],
      mustSeeNotes: undefined,
    }).catch(() => createEmptyDiscovery(point.label));
    const strictBundledPlaces = await searchBundledPlaces(point, request, weather, categoryBundles, localArea, {
      radiusMeters: localArea.strictRadiusMeters,
      relaxCity: false,
    });
    const strictDiscoveryPlaces = filterLocalPlaces(discoveryPlaces(discovery), point, localArea, {
      radiusMeters: localArea.strictRadiusMeters,
      relaxCity: false,
    });
    const strictStage = buildStageResult(
      point,
      request.vibe,
      strictBundledPlaces,
      discovery,
      [
        ...strictBundledPlaces.flatMap((bundle) => bundle.places),
        ...strictDiscoveryPlaces,
      ],
      spendTier,
      foodCtx,
    );

    const relaxedBundledPlaces = strictStage.groundedPlaces.length > 0
      ? strictBundledPlaces
      : await searchBundledPlaces(point, request, weather, categoryBundles, localArea, {
        radiusMeters: localArea.relaxedRadiusMeters,
        relaxCity: true,
      });
    const relaxedDiscoveryPlaces = strictStage.groundedPlaces.length > 0
      ? strictDiscoveryPlaces
      : filterLocalPlaces(discoveryPlaces(discovery), point, localArea, {
        radiusMeters: localArea.relaxedRadiusMeters,
        relaxCity: true,
      });
    const relaxedStage = strictStage.groundedPlaces.length > 0
      ? strictStage
      : buildStageResult(
        point,
        request.vibe,
        relaxedBundledPlaces,
        discovery,
        [
          ...relaxedBundledPlaces.flatMap((bundle) => bundle.places),
          ...relaxedDiscoveryPlaces,
        ],
        spendTier,
        foodCtx,
      );

    const discoveryFallbackPlaces = relaxedStage.groundedPlaces.length > 0
      ? relaxedStage.groundedPlaces
      : uniquePlaces(relaxedDiscoveryPlaces).slice(0, 24);
    const discoveryFallbackStage = relaxedStage.groundedPlaces.length > 0
      ? relaxedStage
      : buildStageResult(
        point,
        request.vibe,
        categoryBundles.map((bundle) => ({ kind: bundle.kind, places: [] })),
        discovery,
        discoveryFallbackPlaces,
        spendTier,
        foodCtx,
      );

    const groundedStage = strictStage.groundedPlaces.length > 0
      ? strictStage
      : relaxedStage.groundedPlaces.length > 0
        ? relaxedStage
        : discoveryFallbackStage;
    const groundedPlaces = groundedStage.groundedPlaces;
    const activeRadiusMeters = strictStage.groundedPlaces.length > 0 ? localArea.strictRadiusMeters : localArea.relaxedRadiusMeters;

    if (groundedPlaces.length === 0) {
      throw new NotEnoughGroundedDataError("No grounded places near this location after discovery and search.", {
        flow: "local_scenario",
        providerName: "publicPlacesProvider|publicDiscoveryProvider",
      });
    }

    hooks?.onStep?.("estimating_movement");
    const route = groundedPlaces.length > 1
      ? await publicRoutingProvider.estimateRoute(groundedPlaces.slice(0, 5)).catch(() => fallbackRoute(groundedPlaces.length))
      : fallbackRoute(groundedPlaces.length);
    const clock = dayjs();
    const timeContext: LocalScenarioTimeContext = {
      hour: clock.hour(),
      weekday: clock.day(),
      spendTier,
    };
    const exploreSpeed = resolveExploreSpeed(request.userPreferences);
    let flickInterestSignals: string[] = [];
    if (request.userId?.trim()) {
      try {
        const lib = await flickSyncLibraryRepository.getUserLibrary(request.userId.trim(), 48);
        flickInterestSignals = flickTitleSignalsForStoryLayer(lib);
      } catch {
        flickInterestSignals = [];
      }
    }
    const storyRaw = storySuggestionsForRightNow({
      city: foodCtx.city,
      country: foodCtx.country,
      availableMinutes: request.availableMinutes,
      flickInterestSignals,
      prefs: request.userPreferences ?? null,
    });
    const storyRefined = refineStoryTravelExperiences(
      storyRaw,
      {
        tripDurationDays: 1,
        pace: "balanced",
        budgetStyle: "balanced",
        primaryCity: foodCtx.city,
        primaryCountry: foodCtx.country,
      },
      1,
    );
    const storyTravelAppendix = formatStoryTravelPromptAppendix(storyRefined);
    const prompt = buildLocalScenarioPrompt(
      point.label,
      request.vibe,
      request.availableMinutes,
      weather,
      activeRadiusMeters,
      planningContext,
      timeContext,
      exploreSpeed,
      formatFoodCultureForRightNowPrompt(rightNowFoodLayer, planner, timeContext.hour),
      storyTravelAppendix,
    );
    const allowFoodCrawl = detectFoodCrawlIntent(request.vibe);

    hooks?.onStep?.("composing_scenarios");
    const localEngineScenarioList = groundedPlaces.length > 0
      ? await attachMovementLegs(
        buildRankedScenarios(
          request,
          point,
          localArea,
          weather,
          groundedStage.rankedPools,
          route,
          discovery,
          planningContext,
          rightNowFoodLayer,
        ),
      )
      : [];
    const localEngineScenarios = generatedLocalScenariosSchema.parse({ scenarios: localEngineScenarioList });
    const emitBatches = async (scenarios: GeneratedLocalScenarios["scenarios"], total: number): Promise<void> => {
      if (!hooks?.onBatch) {
        return;
      }

      for (let index = 0; index < scenarios.length; index += 4) {
        await hooks.onBatch(scenarios.slice(index, index + 4), total);
        await wait(progressiveDelayMs);
      }
    };

    await emitBatches(localEngineScenarios.scenarios, localEngineScenarios.scenarios.length);

    try {
      hooks?.onStep?.("refining_with_ai");
      const aiResult = await openAiGatewayClient.generateLocalScenarios({
        request: { ...request, locationLabel: point.label, latitude: point.latitude, longitude: point.longitude },
        weather,
        places: groundedPlaces.slice(0, 10),
        discovery,
        route,
        prompt,
      });

      hooks?.onStep?.("polishing_itinerary");
      const merged = uniqueScenarios([...localEngineScenarios.scenarios, ...aiResult.scenarios])
        .map((scenario) => {
          const scenarioDateValue = dayjs().format("YYYY-MM-DD");
          const openingCheckedBlocks = scenario.blocks.map((block) => openingHoursService.enrichBlockWithOpenReplacement(block, scenarioDateValue));
          const optimized = optimizeItineraryBlocks(scenario.blocks, {
            origin: { latitude: point.latitude, longitude: point.longitude },
            allowFoodCrawl,
            preserveAnchors: false,
          });
          const finalBlocks = optimized.blocks.map((block, index) => openingCheckedBlocks[index] ?? block);
          const metrics = scoreItineraryComposition(finalBlocks, {
            origin: { latitude: point.latitude, longitude: point.longitude },
            allowFoodCrawl,
            preserveAnchors: false,
          });

          return {
            ...scenario,
            blocks: finalBlocks,
            routeLogic: sanitizeUserFacingDescription(metrics.summary),
            rankingScore: metrics.score,
          };
        })
        .filter((scenario) =>
          scenario.blocks.every((block) =>
            Boolean(block.place) &&
            isPlaceInsideLocalArea(block.place as PlaceSnapshot, point, localArea, {
              radiusMeters: localArea.relaxedRadiusMeters,
              relaxCity: false,
            })),
        )
        .sort((left, right) => right.rankingScore - left.rankingScore)
        .slice(0, 20)
        .map(({ rankingScore: _rankingScore, ...scenario }) => scenario);
      const enrichedMerged = await attachMovementLegs(merged);
      if (enrichedMerged.length > localEngineScenarios.scenarios.length && hooks?.onBatch) {
        await hooks.onBatch(enrichedMerged.slice(localEngineScenarios.scenarios.length), enrichedMerged.length);
      }

      return generatedLocalScenariosSchema.parse({ scenarios: enrichedMerged });
    } catch (error) {
      debugLogError("local_scenario_ai_refinement", error);
      throw error;
    }
  },
};
