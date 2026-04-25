import type { ActivityBlock, PlaceSnapshot } from "../../entities/activity/model";
import type { TravelTasteProfile } from "../../features/user-taste/travelTaste.types";
import {
  defaultTasteExplorationMix,
  isTasteExplorationCategory,
  tasteTransitionCostDelta,
} from "../../features/user-taste/travelTasteCalculator";

export type ItineraryCategory =
  | "food"
  | "drink"
  | "cafe"
  | "museum"
  | "gallery"
  | "walk"
  | "landmark"
  | "transfer"
  | "event"
  | "rest"
  | "other";

interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface OptimizeItineraryOptions {
  origin?: RoutePoint;
  allowFoodCrawl?: boolean;
  preserveAnchors?: boolean;
  /** Personal taste — adjusts stop ordering only; orthogonal to travel-behavior pacing metrics. */
  travelTasteProfile?: TravelTasteProfile | null;
  /** Target share of reorder picks that skew toward low-confidence categories (min ~20% when taste is active). */
  tasteExplorationMix?: number;
}

export interface ItineraryCompositionMetrics {
  score: number;
  pathDistanceMeters: number;
  coherencePenalty: number;
  repetitionPenalty: number;
  backtrackingPenalty: number;
  varietyReward: number;
  summary: string;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const hasCoordinates = (place: PlaceSnapshot | undefined): place is PlaceSnapshot & RoutePoint =>
  place?.latitude !== undefined && place.longitude !== undefined;

const pointFromPlace = (place: PlaceSnapshot | undefined): RoutePoint | null =>
  hasCoordinates(place) ? { latitude: place.latitude, longitude: place.longitude } : null;

const distanceMeters = (left: RoutePoint, right: RoutePoint): number => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const headingDegrees = (from: RoutePoint, to: RoutePoint): number => {
  const latitudeFrom = toRadians(from.latitude);
  const latitudeTo = toRadians(to.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const y = Math.sin(deltaLongitude) * Math.cos(latitudeTo);
  const x =
    Math.cos(latitudeFrom) * Math.sin(latitudeTo) -
    Math.sin(latitudeFrom) * Math.cos(latitudeTo) * Math.cos(deltaLongitude);

  return (Math.atan2(y, x) * 180) / Math.PI;
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const categoryFromText = (value: string): ItineraryCategory => {
  const normalized = normalizeText(value);
  if (normalized.length === 0) {
    return "other";
  }
  if (normalized.includes("transfer") || normalized.includes("train") || normalized.includes("flight") || normalized.includes("metro")) {
    return "transfer";
  }
  if (normalized.includes("concert") || normalized.includes("festival") || normalized.includes("show") || normalized.includes("gig") || normalized.includes("event")) {
    return "event";
  }
  if (normalized.includes("museum")) {
    return "museum";
  }
  if (normalized.includes("gallery")) {
    return "gallery";
  }
  if (normalized.includes("cafe") || normalized.includes("coffee") || normalized.includes("espresso") || normalized.includes("bakery")) {
    return "cafe";
  }
  if (
    normalized.includes("drink") ||
    normalized.includes("bar") ||
    normalized.includes("cocktail") ||
    normalized.includes("pub") ||
    normalized.includes("sake") ||
    normalized.includes("wine") ||
    normalized.includes("beer")
  ) {
    return "drink";
  }
  if (
    normalized.includes("food") ||
    normalized.includes("restaurant") ||
    normalized.includes("eat") ||
    normalized.includes("lunch") ||
    normalized.includes("dinner") ||
    normalized.includes("brunch") ||
    normalized.includes("ramen") ||
    normalized.includes("sushi") ||
    normalized.includes("fugu")
  ) {
    return "food";
  }
  if (normalized.includes("walk") || normalized.includes("stroll") || normalized.includes("wander") || normalized.includes("park")) {
    return "walk";
  }
  if (normalized.includes("landmark") || normalized.includes("viewpoint") || normalized.includes("temple") || normalized.includes("shrine")) {
    return "landmark";
  }
  return "other";
};

const isFoodLike = (category: ItineraryCategory): boolean => category === "food" || category === "drink" || category === "cafe";

const blockPoint = (block: ActivityBlock): RoutePoint | null => pointFromPlace(block.place);

const angleDelta = (left: number, right: number): number => {
  const raw = Math.abs(left - right) % 360;
  return raw > 180 ? 360 - raw : raw;
};

const isAnchorBlock = (block: ActivityBlock): boolean => {
  const category = normalizeItineraryCategory(block);
  return block.locked || category === "transfer" || category === "event";
};

const averageDistanceToOtherPoints = (candidate: ActivityBlock, blocks: ActivityBlock[]): number => {
  const candidatePoint = blockPoint(candidate);
  if (!candidatePoint) {
    return 900;
  }

  const distances = blocks
    .map((block) => blockPoint(block))
    .filter((point): point is RoutePoint => Boolean(point))
    .map((point) => distanceMeters(candidatePoint, point));

  if (distances.length === 0) {
    return 0;
  }

  return distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
};

const slotTimes = (blocks: ActivityBlock[]): Array<{ startTime: string; endTime: string }> =>
  blocks.map((block) => ({
    startTime: block.startTime,
    endTime: block.endTime,
  }));

const applyOriginalTimeSlots = (orderedBlocks: ActivityBlock[], templateBlocks: ActivityBlock[]): ActivityBlock[] => {
  const slots = slotTimes(templateBlocks);
  return orderedBlocks.map((block, index) => ({
    ...block,
    startTime: slots[index]?.startTime ?? block.startTime,
    endTime: slots[index]?.endTime ?? block.endTime,
  }));
};

const transitionPenalty = (
  previousBlocks: ActivityBlock[],
  candidate: ActivityBlock,
  currentPoint: RoutePoint | undefined,
  endPoint: RoutePoint | undefined,
  origin: RoutePoint | undefined,
  allowFoodCrawl: boolean,
  seenCategories: Set<ItineraryCategory>,
  travelTasteProfile?: TravelTasteProfile | null,
): number => {
  const category = normalizeItineraryCategory(candidate);
  const lastBlock = previousBlocks.length > 0 ? previousBlocks[previousBlocks.length - 1] : undefined;
  const twoBackBlock = previousBlocks.length > 1 ? previousBlocks[previousBlocks.length - 2] : undefined;
  const lastCategory = lastBlock ? normalizeItineraryCategory(lastBlock) : null;
  const twoBackCategory = twoBackBlock ? normalizeItineraryCategory(twoBackBlock) : null;
  const candidatePoint = blockPoint(candidate);

  let penalty = 0;

  if (lastCategory === category) {
    penalty += 240;
  }
  if (!allowFoodCrawl && lastCategory && twoBackCategory && isFoodLike(lastCategory) && isFoodLike(twoBackCategory) && isFoodLike(category)) {
    penalty += 1200;
  }
  if (!allowFoodCrawl && lastCategory && isFoodLike(lastCategory) && isFoodLike(category)) {
    penalty += 260;
  }
  if (lastCategory === "museum" && category === "museum") {
    penalty += 200;
  }
  if (lastCategory === "gallery" && category === "gallery") {
    penalty += 180;
  }
  if (seenCategories.has(category)) {
    penalty += 70;
  } else {
    penalty -= 50;
  }
  if (lastCategory === "food" && category === "drink") {
    penalty -= 45;
  }
  if ((lastCategory === "museum" || lastCategory === "gallery") && (category === "walk" || category === "landmark" || category === "cafe")) {
    penalty -= 60;
  }
  if (currentPoint && candidatePoint) {
    const hopDistance = distanceMeters(currentPoint, candidatePoint);
    penalty += hopDistance;
    if (hopDistance > 2600) {
      penalty += (hopDistance - 2600) * 0.45;
    }
  } else if (!candidatePoint) {
    penalty += 180;
  }
  if (endPoint && candidatePoint) {
    penalty += distanceMeters(candidatePoint, endPoint) * 0.35;
  }
  if (origin && currentPoint && candidatePoint) {
    const currentFromOrigin = distanceMeters(origin, currentPoint);
    const candidateFromOrigin = distanceMeters(origin, candidatePoint);
    if (candidateFromOrigin + 220 < currentFromOrigin) {
      penalty += 220;
    }
  }

  penalty += tasteTransitionCostDelta(category, travelTasteProfile);

  return penalty;
};

const reorderWindow = (
  windowBlocks: ActivityBlock[],
  startPoint: RoutePoint | undefined,
  endPoint: RoutePoint | undefined,
  allowFoodCrawl: boolean,
  origin: RoutePoint | undefined,
  options: OptimizeItineraryOptions,
): ActivityBlock[] => {
  if (windowBlocks.length < 2) {
    return windowBlocks;
  }

  const tasteProfile = options.travelTasteProfile ?? null;
  const explorationMix = Math.max(defaultTasteExplorationMix, options.tasteExplorationMix ?? defaultTasteExplorationMix);
  const explorationQuota = tasteProfile && tasteProfile.confidence >= 0.08 ? Math.ceil(windowBlocks.length * explorationMix) : 0;

  const remaining = [...windowBlocks];
  const ordered: ActivityBlock[] = [];
  const seenCategories = new Set<ItineraryCategory>();
  let currentPoint = startPoint;
  let explorationPicked = 0;

  const costFor = (candidate: ActivityBlock): number => {
    if (currentPoint || endPoint) {
      return transitionPenalty(ordered, candidate, currentPoint, endPoint, origin, allowFoodCrawl, seenCategories, tasteProfile);
    }
    return (
      averageDistanceToOtherPoints(candidate, remaining) +
      transitionPenalty(ordered, candidate, undefined, endPoint, origin, allowFoodCrawl, seenCategories, tasteProfile)
    );
  };

  while (remaining.length > 0) {
    const positionsLeft = remaining.length;
    const explorationDebt = explorationQuota - explorationPicked;
    const mustPickExploration = explorationDebt > 0 && explorationDebt === positionsLeft;

    const scored = remaining.map((candidate, index) => {
      const category = normalizeItineraryCategory(candidate);
      return {
        index,
        candidate,
        total: costFor(candidate),
        exploration: isTasteExplorationCategory(category, tasteProfile),
      };
    });

    let pool = scored;
    if (mustPickExploration) {
      const explorationRows = scored.filter((row) => row.exploration);
      if (explorationRows.length > 0) {
        pool = explorationRows;
      }
    } else if (explorationDebt > 0 && tasteProfile) {
      const minTotal = Math.min(...scored.map((row) => row.total));
      const bestExploration = scored
        .filter((row) => row.exploration)
        .sort((left, right) => left.total - right.total)[0];
      if (bestExploration && bestExploration.total <= minTotal + 420) {
        pool = [bestExploration];
      }
    }

    const bestRow = pool.reduce((best, row) => (row.total < best.total ? row : best));
    const [nextBlock] = remaining.splice(bestRow.index, 1);
    if (!nextBlock) {
      break;
    }
    if (isTasteExplorationCategory(normalizeItineraryCategory(nextBlock), tasteProfile)) {
      explorationPicked += 1;
    }
    ordered.push(nextBlock);
    seenCategories.add(normalizeItineraryCategory(nextBlock));
    currentPoint = blockPoint(nextBlock) ?? currentPoint;
  }

  return ordered;
};

export const normalizeItineraryCategory = (block: Pick<ActivityBlock, "category" | "type" | "tags" | "title" | "description">): ItineraryCategory => {
  if (block.type === "transfer") {
    return "transfer";
  }
  if (block.type === "rest") {
    return "rest";
  }

  const combined = [block.category, ...block.tags, block.title, block.description].join(" ").trim();
  return categoryFromText(combined);
};

export const detectFoodCrawlIntent = (...inputs: string[]): boolean => {
  const combined = inputs.join(" ").toLowerCase();
  return [
    "food crawl",
    "bar crawl",
    "pub crawl",
    "wine crawl",
    "tasting route",
    "tasting tour",
    "food tour",
    "street food crawl",
    "sake crawl",
  ].some((needle) => combined.includes(needle));
};

export const scoreItineraryComposition = (
  blocks: ActivityBlock[],
  options: OptimizeItineraryOptions = {},
): ItineraryCompositionMetrics => {
  const categories = blocks.map((block) => normalizeItineraryCategory(block));
  const points = blocks.map((block) => blockPoint(block));
  const uniqueCategories = new Set(categories.filter((category) => category !== "other" && category !== "transfer"));
  const origin = options.origin;

  let pathDistanceMeters = 0;
  let coherencePenalty = 0;
  let repetitionPenalty = 0;
  let backtrackingPenalty = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const category = categories[index] ?? "other";
    const lastCategory = index > 0 ? (categories[index - 1] ?? null) : null;
    const twoBackCategory = index > 1 ? (categories[index - 2] ?? null) : null;

    if (lastCategory === category) {
      repetitionPenalty += category === "museum" || category === "gallery" ? 180 : 140;
    }
    if (!options.allowFoodCrawl && lastCategory && twoBackCategory && isFoodLike(lastCategory) && isFoodLike(twoBackCategory) && isFoodLike(category)) {
      repetitionPenalty += 1300;
    }

    const previousPoint = index > 0 ? points[index - 1] : origin ?? null;
    const currentPoint = points[index];
    if (previousPoint && currentPoint) {
      const hopDistance = distanceMeters(previousPoint, currentPoint);
      pathDistanceMeters += hopDistance;
      coherencePenalty += hopDistance > 3200 ? 320 + (hopDistance - 3200) * 0.4 : hopDistance * 0.08;
    }

    if (origin && index > 0) {
      const previousPointFromOrigin = points[index - 1] ?? null;
      const previousFromOrigin = previousPointFromOrigin ? distanceMeters(origin, previousPointFromOrigin) : 0;
      const currentFromOrigin = currentPoint ? distanceMeters(origin, currentPoint) : previousFromOrigin;
      if (currentFromOrigin + 250 < previousFromOrigin) {
        backtrackingPenalty += 240 + (previousFromOrigin - currentFromOrigin) * 0.15;
      }
    }

    if (index > 1) {
      const a = points[index - 2];
      const b = points[index - 1];
      const c = currentPoint;
      if (a && b && c) {
        const firstHop = distanceMeters(a, b);
        const secondHop = distanceMeters(b, c);
        const turn = angleDelta(headingDegrees(a, b), headingDegrees(b, c));
        if (firstHop > 240 && secondHop > 240 && turn > 145) {
          backtrackingPenalty += 240;
        }
      }
    }
  }

  const varietyReward =
    uniqueCategories.size * 170 +
    (uniqueCategories.has("walk") || uniqueCategories.has("landmark") ? 90 : 0) +
    (uniqueCategories.has("museum") || uniqueCategories.has("gallery") ? 80 : 0);

  const score = varietyReward - repetitionPenalty - coherencePenalty - backtrackingPenalty;
  const summary =
    backtrackingPenalty <= 120 && pathDistanceMeters <= 1800
      ? "The route keeps moving forward through nearby stops with very little doubling back."
      : backtrackingPenalty <= 280
        ? "The route stays mostly forward-moving, with only small detours between stops."
        : "The route still works, but a few hops stretch farther than the cleanest nearby flow.";

  return {
    score,
    pathDistanceMeters,
    coherencePenalty,
    repetitionPenalty,
    backtrackingPenalty,
    varietyReward,
    summary,
  };
};

export const optimizeItineraryBlocks = (
  blocks: ActivityBlock[],
  options: OptimizeItineraryOptions = {},
): { blocks: ActivityBlock[]; metrics: ItineraryCompositionMetrics } => {
  if (blocks.length < 2) {
    return {
      blocks,
      metrics: scoreItineraryComposition(blocks, options),
    };
  }

  const preserveAnchors = options.preserveAnchors ?? true;
  const allowFoodCrawl = options.allowFoodCrawl ?? false;
  const orderedBlocks = [...blocks];
  const anchorIndexes = preserveAnchors
    ? orderedBlocks.map((block, index) => (isAnchorBlock(block) ? index : -1)).filter((index) => index >= 0)
    : [];

  let previousAnchorIndex = -1;
  let referencePoint = options.origin;

  for (const anchorIndex of [...anchorIndexes, orderedBlocks.length]) {
    const sliceStart = previousAnchorIndex + 1;
    const sliceEnd = anchorIndex;
    const slice = orderedBlocks.slice(sliceStart, sliceEnd);
    const anchorBlock = anchorIndex < orderedBlocks.length ? orderedBlocks[anchorIndex] : undefined;
    const endPoint = anchorBlock ? blockPoint(anchorBlock) ?? undefined : undefined;
    const reorderedSlice = reorderWindow(slice, referencePoint, endPoint, allowFoodCrawl, options.origin, options);
    orderedBlocks.splice(sliceStart, slice.length, ...reorderedSlice);

    if (anchorBlock) {
      referencePoint = blockPoint(anchorBlock) ?? referencePoint;
    } else {
      const lastReorderedBlock = reorderedSlice.at(-1);
      referencePoint = lastReorderedBlock ? blockPoint(lastReorderedBlock) ?? referencePoint : referencePoint;
    }

    previousAnchorIndex = anchorIndex;
  }

  const blocksWithOriginalTimeSlots = applyOriginalTimeSlots(orderedBlocks, blocks);
  return {
    blocks: blocksWithOriginalTimeSlots,
    metrics: scoreItineraryComposition(blocksWithOriginalTimeSlots, options),
  };
};
