import dayjs from "dayjs";
import type { ActivityAlternative, ActivityBlock, ActivityBlockType, CostRange, PlaceSnapshot } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { RightNowExploreSpeed } from "../../entities/user/model";
import type { LocalScenario } from "../../entities/local-scenario/model";
import type { ReplanAction, ReplanProposal } from "../../entities/replan/model";
import type {
  AnchorEvent,
  IntercityMove,
  TravelExecutionProfile,
  TravelSupportPlan,
  Trip,
  TripBudget,
  TripPlanningMode,
  TripPreferences,
  TripSegment,
} from "../../entities/trip/model";
import { createClientId } from "../../shared/lib/id";
import { nowIso } from "../firebase/timestampMapper";
import { getRightNowBlockBounds } from "./promptBuilders/localScenarioPromptBuilder";
import type { ChatReplanResponse, GeneratedLocalScenarios, GeneratedTripOptions, LocalScenarioChatResponse } from "./schemas";
import type { TripOptionCountPlan } from "../planning/tripOptionCountService";
import { resolveTripOptionCountFromDraft } from "../planning/tripOptionCountService";

interface TripDraftLike {
  userId: string;
  planningMode?: TripPlanningMode;
  destination: string;
  tripSegments: TripSegment[];
  dateRange: Trip["dateRange"];
  flightInfo: Trip["flightInfo"];
  hotelInfo: Trip["hotelInfo"];
  budget: TripBudget;
  preferences: TripPreferences;
  executionProfile: TravelExecutionProfile;
  anchorEvents: AnchorEvent[];
}

interface LocalScenarioNormalizationContext {
  userId?: string;
  locationLabel: string;
  availableMinutes?: number;
  exploreSpeed?: RightNowExploreSpeed;
}

const defaultTripOptionLabels = ["Balanced", "Cultural", "Food and night", "Comfort-forward", "High-impact", "Local depth"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const asString = (value: unknown): string | undefined => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined);

const asNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

const asBoolean = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const next = asString(value);
    if (next) {
      return next;
    }
  }

  return undefined;
};

const normalizeText = (value: string | undefined): string => value?.trim().toLowerCase() ?? "";

const normalizeCostRange = (value: unknown, currencyFallback: string): CostRange => {
  const data = isRecord(value) ? value : {};
  const min = Math.max(0, asNumber(data.min) ?? 0);
  const rawMax = asNumber(data.max) ?? min;
  const max = Math.max(min, rawMax);
  const currency = asString(data.currency) ?? currencyFallback;
  const certaintyValue = asString(data.certainty);
  const certainty: CostRange["certainty"] =
    certaintyValue === "exact" || certaintyValue === "estimated" || certaintyValue === "unknown"
      ? certaintyValue
      : "unknown";

  return {
    min,
    max,
    currency,
    certainty,
  };
};

const normalizePlace = (value: unknown): PlaceSnapshot | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = firstString(value.name, value.title);
  if (!name) {
    return undefined;
  }

  return {
    provider: asString(value.provider) ?? "ai_repaired",
    providerPlaceId: asString(value.providerPlaceId),
    name,
    address: asString(value.address),
    city: asString(value.city),
    country: asString(value.country),
    latitude: asNumber(value.latitude),
    longitude: asNumber(value.longitude),
    openingHoursLabel: asString(value.openingHoursLabel),
    priceLevel: asNumber(value.priceLevel),
    rating: asNumber(value.rating),
    capturedAt: asString(value.capturedAt) ?? nowIso(),
  };
};

const inferBlockType = (value: unknown, category: string, title: string): ActivityBlockType => {
  const explicit = asString(value);
  if (explicit === "activity" || explicit === "meal" || explicit === "transfer" || explicit === "rest") {
    return explicit;
  }

  const signature = `${category} ${title}`.toLowerCase();
  if (signature.includes("meal") || signature.includes("food") || signature.includes("restaurant") || signature.includes("cafe") || signature.includes("drink")) {
    return "meal";
  }
  if (signature.includes("transfer") || signature.includes("taxi") || signature.includes("train") || signature.includes("metro") || signature.includes("flight")) {
    return "transfer";
  }
  if (signature.includes("rest") || signature.includes("hotel") || signature.includes("check-in") || signature.includes("check in")) {
    return "rest";
  }

  return "activity";
};

const normalizeAlternative = (value: unknown, currencyFallback: string): ActivityAlternative | null => {
  if (!isRecord(value)) {
    return null;
  }

  const title = firstString(value.title, value.name);
  if (!title) {
    return null;
  }

  return {
    id: asString(value.id) ?? createClientId("alt"),
    title,
    reason: asString(value.reason) ?? "A nearby alternative if you want a different version of the same mood.",
    estimatedCost: value.estimatedCost ? normalizeCostRange(value.estimatedCost, currencyFallback) : undefined,
    place: normalizePlace(value.place),
  };
};

const normalizeBlock = (value: unknown, index: number, currencyFallback: string): ActivityBlock | null => {
  if (!isRecord(value)) {
    return null;
  }

  const title = firstString(value.title, value.name, `Step ${index + 1}`);
  if (!title) {
    return null;
  }

  const category = firstString(value.category, value.type, "activity") ?? "activity";
  const type = inferBlockType(value.type, category, title);
  const place = normalizePlace(value.place);
  const sourceSnapshots = asArray(value.sourceSnapshots)
    .map((item) => normalizePlace(item))
    .filter((item): item is PlaceSnapshot => Boolean(item));

  if (place && sourceSnapshots.length === 0) {
    sourceSnapshots.push(place);
  }

  return {
    id: asString(value.id) ?? createClientId("block"),
    type,
    title,
    description: asString(value.description) ?? "",
    startTime: asString(value.startTime) ?? "10:00",
    endTime: asString(value.endTime) ?? "11:00",
    place,
    category,
    tags: asArray(value.tags).map((item) => asString(item)).filter((item): item is string => Boolean(item)),
    indoorOutdoor:
      asString(value.indoorOutdoor) === "indoor" || asString(value.indoorOutdoor) === "outdoor" || asString(value.indoorOutdoor) === "mixed"
        ? (asString(value.indoorOutdoor) as ActivityBlock["indoorOutdoor"])
        : "mixed",
    estimatedCost: normalizeCostRange(value.estimatedCost, currencyFallback),
    dependencies: {
      weatherSensitive: asBoolean(isRecord(value.dependencies) ? value.dependencies.weatherSensitive : undefined) ?? false,
      bookingRequired: asBoolean(isRecord(value.dependencies) ? value.dependencies.bookingRequired : undefined) ?? false,
      openingHoursSensitive: asBoolean(isRecord(value.dependencies) ? value.dependencies.openingHoursSensitive : undefined) ?? Boolean(place?.openingHoursLabel),
      priceSensitive: asBoolean(isRecord(value.dependencies) ? value.dependencies.priceSensitive : undefined) ?? true,
    },
    alternatives: asArray(value.alternatives)
      .map((item) => normalizeAlternative(item, currencyFallback))
      .filter((item): item is ActivityAlternative => Boolean(item)),
    sourceSnapshots,
    priority:
      asString(value.priority) === "must" || asString(value.priority) === "should" || asString(value.priority) === "optional"
        ? (asString(value.priority) as ActivityBlock["priority"])
        : "should",
    locked: asBoolean(value.locked) ?? false,
    completionStatus:
      asString(value.completionStatus) === "pending" ||
      asString(value.completionStatus) === "in_progress" ||
      asString(value.completionStatus) === "unconfirmed" ||
      asString(value.completionStatus) === "done" ||
      asString(value.completionStatus) === "skipped" ||
      asString(value.completionStatus) === "missed" ||
      asString(value.completionStatus) === "cancelled_by_replan"
        ? (asString(value.completionStatus) as ActivityBlock["completionStatus"])
        : "pending",
  };
};

const normalizeTravelSupport = (value: unknown): TravelSupportPlan | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const timezones: Array<TravelSupportPlan["timezones"][number] | null> = asArray(value.timezones).map((item) => {
    if (!isRecord(item)) {
      return null;
    }

    const segmentId = asString(item.segmentId);
    if (!segmentId) {
      return null;
    }

    return {
      segmentId,
      timezone: asString(item.timezone),
      utcOffsetMinutes: asNumber(item.utcOffsetMinutes),
    };
  });

  return {
    timezones: timezones.filter((item): item is TravelSupportPlan["timezones"][number] => item !== null),
    jetLag: {
      expectedShiftHours: isRecord(value.jetLag) ? asNumber(value.jetLag.expectedShiftHours) : undefined,
      arrivalFatigue:
        isRecord(value.jetLag) &&
        (asString(value.jetLag.arrivalFatigue) === "low" ||
          asString(value.jetLag.arrivalFatigue) === "medium" ||
          asString(value.jetLag.arrivalFatigue) === "high")
          ? (asString(value.jetLag.arrivalFatigue) as TravelSupportPlan["jetLag"]["arrivalFatigue"])
          : "medium",
      guidance: isRecord(value.jetLag)
        ? asArray(value.jetLag.guidance).map((item) => asString(item)).filter((item): item is string => Boolean(item))
        : [],
    },
    preDepartureChecklist: asArray(value.preDepartureChecklist)
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        const label = asString(item.label);
        const category = asString(item.category);
        if (
          !label ||
          (category !== "documents" &&
            category !== "weather" &&
            category !== "tickets" &&
            category !== "transport" &&
            category !== "packing" &&
            category !== "health")
        ) {
          return null;
        }

        return {
          id: asString(item.id) ?? createClientId("check"),
          label,
          category,
          done: asBoolean(item.done) ?? false,
        };
      })
      .filter((item): item is TravelSupportPlan["preDepartureChecklist"][number] => Boolean(item)),
    clothingReminders: asArray(value.clothingReminders).map((item) => asString(item)).filter((item): item is string => Boolean(item)),
    railPassConsideration: isRecord(value.railPassConsideration) && typeof value.railPassConsideration.worthConsidering === "boolean"
      ? {
          worthConsidering: value.railPassConsideration.worthConsidering,
          rationale: asString(value.railPassConsideration.rationale) ?? "",
          confidence:
            asString(value.railPassConsideration.confidence) === "low" ||
            asString(value.railPassConsideration.confidence) === "medium" ||
            asString(value.railPassConsideration.confidence) === "high"
              ? (asString(value.railPassConsideration.confidence) as NonNullable<TravelSupportPlan["railPassConsideration"]>["confidence"])
              : "low",
        }
      : undefined,
  };
};

const normalizeIntercityMoves = (value: unknown): IntercityMove[] | undefined => {
  const moves: Array<IntercityMove | null> = asArray(value).map((move) => {
      if (!isRecord(move)) {
        return null;
      }

      const fromSegmentId = asString(move.fromSegmentId);
      const toSegmentId = asString(move.toSegmentId);
      if (!fromSegmentId || !toSegmentId) {
        return null;
      }

      const transportCandidates: Array<IntercityMove["transportCandidates"][number] | null> = asArray(move.transportCandidates).map((candidate) => {
        if (!isRecord(candidate)) {
          return null;
        }

        const type = asString(candidate.type);
        if (type !== "train" && type !== "flight" && type !== "bus" && type !== "ferry" && type !== "custom") {
          return null;
        }

        const feasibility = asString(candidate.feasibility);
        return {
          type,
          estimatedDurationMinutes: Math.max(0, Math.round(asNumber(candidate.estimatedDurationMinutes) ?? 0)),
          stationOrAirportTransferMinutes: Math.max(0, Math.round(asNumber(candidate.stationOrAirportTransferMinutes) ?? 0)),
          bufferMinutes: Math.max(0, Math.round(asNumber(candidate.bufferMinutes) ?? 0)),
          baggageFriction:
            asString(candidate.baggageFriction) === "low" ||
            asString(candidate.baggageFriction) === "medium" ||
            asString(candidate.baggageFriction) === "high"
              ? (asString(candidate.baggageFriction) as IntercityMove["transportCandidates"][number]["baggageFriction"])
              : "medium",
          estimatedCost: isRecord(candidate.estimatedCost)
            ? {
                min: Math.max(0, asNumber(candidate.estimatedCost.min) ?? 0),
                max: Math.max(0, asNumber(candidate.estimatedCost.max) ?? asNumber(candidate.estimatedCost.min) ?? 0),
                currency: asString(candidate.estimatedCost.currency) ?? "EUR",
                approximate: asBoolean(candidate.estimatedCost.approximate) ?? true,
              }
            : undefined,
          sourceSnapshot: asString(candidate.sourceSnapshot),
          feasibility:
            feasibility === "easy" ||
            feasibility === "possible" ||
            feasibility === "tight" ||
            feasibility === "risky" ||
            feasibility === "unrealistic"
              ? feasibility
              : "possible",
        };
      });

      return {
        id: asString(move.id) ?? createClientId("move"),
        fromSegmentId,
        toSegmentId,
        transportCandidates: transportCandidates.filter((candidate): candidate is IntercityMove["transportCandidates"][number] => candidate !== null),
      };
    });

  const normalizedMoves = moves.filter((move): move is IntercityMove => move !== null);
  return normalizedMoves.length > 0 ? normalizedMoves : undefined;
};

const normalizeTrip = (value: unknown, draft: TripDraftLike, optionIndex: number): Trip => {
  const data = isRecord(value) ? value : {};
  const tripId = asString(data.id) ?? createClientId("trip");
  const title =
    asString(data.title) ??
    `${draft.destination || draft.tripSegments.map((segment) => segment.city).join(" → ")} ${defaultTripOptionLabels[optionIndex] ?? `Option ${optionIndex + 1}`}`;

  return {
    id: tripId,
    userId: draft.userId,
    title,
    destination: draft.destination,
    tripSegments: draft.tripSegments,
    dateRange: draft.dateRange,
    flightInfo: draft.flightInfo,
    hotelInfo: draft.hotelInfo,
    budget: draft.budget,
    preferences: {
      ...draft.preferences,
      mustSeeNotes: draft.preferences.mustSeeNotes ?? "",
      specialWishes: draft.preferences.specialWishes ?? "",
    },
    executionProfile: draft.executionProfile,
    anchorEvents: draft.anchorEvents,
    intercityMoves: normalizeIntercityMoves(data.intercityMoves),
    travelSupport: normalizeTravelSupport(data.travelSupport),
    status:
      asString(data.status) === "draft" ||
      asString(data.status) === "active" ||
      asString(data.status) === "needs_review" ||
      asString(data.status) === "completed" ||
      asString(data.status) === "partially_completed" ||
      asString(data.status) === "abandoned" ||
      asString(data.status) === "archived"
        ? (asString(data.status) as Trip["status"])
        : "draft",
    createdAt: asString(data.createdAt) ?? nowIso(),
    updatedAt: asString(data.updatedAt) ?? nowIso(),
    lastValidatedAt: data.lastValidatedAt === null ? null : asString(data.lastValidatedAt) ?? null,
    planVersion: Math.max(0, Math.round(asNumber(data.planVersion) ?? 1)),
  };
};

const findSegmentForDay = (rawDay: Record<string, unknown>, segments: TripSegment[]): TripSegment => {
  const segmentId = asString(rawDay.segmentId);
  const cityLabel = normalizeText(asString(rawDay.cityLabel));
  const dayDate = asString(rawDay.date);

  const exact = segments.find((segment) => segment.id === segmentId);
  if (exact) {
    return exact;
  }

  const cityMatch = segments.find((segment) => normalizeText(segment.city) === cityLabel);
  if (cityMatch) {
    return cityMatch;
  }

  const dateMatch = dayDate ? segments.find((segment) => dayDate >= segment.startDate && dayDate <= segment.endDate) : undefined;
  return dateMatch ?? segments[0] ?? {
    id: createClientId("segment"),
    city: "Unknown city",
    country: "",
    startDate: dayDate ?? dayjs().format("YYYY-MM-DD"),
    endDate: dayDate ?? dayjs().format("YYYY-MM-DD"),
    hotelInfo: {},
  };
};

const normalizeDay = (
  value: unknown,
  draft: TripDraftLike,
  trip: Trip,
  dayIndex: number,
): DayPlan | null => {
  if (!isRecord(value)) {
    return null;
  }

  const matchedSegment = findSegmentForDay(value, draft.tripSegments);
  const blocks = asArray(value.blocks)
    .map((block, index) => normalizeBlock(block, index, trip.budget.currency))
    .filter((block): block is ActivityBlock => Boolean(block));

  const dayDate = asString(value.date) ?? matchedSegment.startDate;

  return {
    id: asString(value.id) ?? createClientId("day"),
    userId: trip.userId,
    tripId: trip.id,
    segmentId: matchedSegment.id,
    cityLabel: matchedSegment.city,
    countryLabel: matchedSegment.country,
    date: dayDate,
    theme: asString(value.theme) ?? `${matchedSegment.city} day ${dayIndex + 1}`,
    blocks,
    movementLegs: undefined,
    estimatedCostRange: normalizeCostRange(value.estimatedCostRange, trip.budget.currency),
    validationStatus:
      asString(value.validationStatus) === "fresh" ||
      asString(value.validationStatus) === "stale" ||
      asString(value.validationStatus) === "needs_review" ||
      asString(value.validationStatus) === "partial" ||
      asString(value.validationStatus) === "failed"
        ? (asString(value.validationStatus) as DayPlan["validationStatus"])
        : "partial",
    warnings: [],
    completionStatus:
      asString(value.completionStatus) === "pending" ||
      asString(value.completionStatus) === "in_progress" ||
      asString(value.completionStatus) === "needs_review" ||
      asString(value.completionStatus) === "done" ||
      asString(value.completionStatus) === "partially_done" ||
      asString(value.completionStatus) === "skipped" ||
      asString(value.completionStatus) === "replanned"
        ? (asString(value.completionStatus) as DayPlan["completionStatus"])
        : "pending",
    updatedAt: asString(value.updatedAt) ?? nowIso(),
  };
};

const optionScore = (option: GeneratedTripOptions["options"][number]): number =>
  option.days.length * 10 +
  option.days.reduce((sum, day) => sum + day.blocks.length, 0) * 4 +
  option.tradeoffs.length * 2 +
  option.trip.tripSegments.length;

const deriveOptionVariant = (
  base: GeneratedTripOptions["options"][number],
  index: number,
): GeneratedTripOptions["options"][number] => ({
  ...base,
  optionId: createClientId("option"),
  label: defaultTripOptionLabels[index] ?? `Option ${index + 1}`,
  positioning: base.positioning || `A different framing of the same grounded route.`,
  tradeoffs: [...base.tradeoffs],
});

export const normalizeGeneratedTripOptions = (raw: unknown, draft: TripDraftLike, plan?: TripOptionCountPlan): GeneratedTripOptions => {
  const resolvedPlan =
    plan ??
    resolveTripOptionCountFromDraft({
      planningMode: draft.planningMode ?? "city_first",
      dateRange: draft.dateRange,
      tripSegments: draft.tripSegments,
      anchorEvents: draft.anchorEvents,
    });
  const root = isRecord(raw) ? raw : {};
  const rawOptions = asArray(root.options ?? raw).slice(0, 12);
  const normalizedOptions = rawOptions
    .map((rawOption, index) => {
      if (!isRecord(rawOption)) {
        return null;
      }

      const trip = normalizeTrip(rawOption.trip, draft, index);
      const days = asArray(rawOption.days)
        .map((day, dayIndex) => normalizeDay(day, draft, trip, dayIndex))
        .filter((day): day is DayPlan => Boolean(day));

      if (days.length === 0) {
        return null;
      }

      return {
        optionId: asString(rawOption.optionId) ?? createClientId("option"),
        label: asString(rawOption.label) ?? defaultTripOptionLabels[index] ?? `Option ${index + 1}`,
        positioning: asString(rawOption.positioning) ?? `${defaultTripOptionLabels[index] ?? "Option"} shaped around the same grounded route.`,
        trip,
        days,
        tradeoffs: asArray(rawOption.tradeoffs).map((item) => asString(item)).filter((item): item is string => Boolean(item)),
      };
    })
    .filter((option): option is GeneratedTripOptions["options"][number] => Boolean(option))
    .sort((left, right) => optionScore(right) - optionScore(left));

  if (normalizedOptions.length === 0) {
    throw new Error("AI returned trip options that could not be repaired into a usable plan.");
  }

  const max = Math.min(5, Math.max(1, resolvedPlan.max));
  const min = Math.min(max, Math.max(1, resolvedPlan.min));
  let best = normalizedOptions.slice(0, max);
  let guard = 0;
  while (best.length < min && best.length < max && best.length > 0 && guard < max) {
    const source = best[best.length - 1] ?? best[0];
    if (!source) {
      break;
    }
    best = [...best, deriveOptionVariant(source, best.length)];
    guard += 1;
  }

  return { options: best.slice(0, max) };
};

const normalizeScenario = (
  value: unknown,
  index: number,
  context: LocalScenarioNormalizationContext,
): LocalScenario | null => {
  if (!isRecord(value)) {
    return null;
  }

  const locationLabel = asString(value.locationLabel) ?? context.locationLabel;
  const blocks = asArray(value.blocks)
    .map((block, blockIndex) => normalizeBlock(block, blockIndex, "EUR"))
    .filter((block): block is ActivityBlock => Boolean(block));

  const bounds = getRightNowBlockBounds(Math.max(15, context.availableMinutes ?? 60), context.exploreSpeed ?? "balanced");
  const trimmedBlocks = blocks.slice(0, bounds.max);
  if (trimmedBlocks.length < 1) {
    return null;
  }

  return {
    id: asString(value.id) ?? createClientId("scenario"),
    userId: asString(value.userId) ?? context.userId,
    theme: asString(value.theme) ?? `Nearby option ${index + 1}`,
    locationLabel,
    estimatedDurationMinutes: Math.max(15, Math.round(asNumber(value.estimatedDurationMinutes) ?? context.availableMinutes ?? 90)),
    estimatedCostRange: normalizeCostRange(value.estimatedCostRange, trimmedBlocks[0]?.estimatedCost.currency ?? "EUR"),
    weatherFit:
      asString(value.weatherFit) === "excellent" ||
      asString(value.weatherFit) === "good" ||
      asString(value.weatherFit) === "risky" ||
      asString(value.weatherFit) === "indoor"
        ? (asString(value.weatherFit) as LocalScenario["weatherFit"])
        : "good",
    routeLogic: asString(value.routeLogic) ?? "",
    blocks: trimmedBlocks,
    movementLegs: undefined,
    alternatives: asArray(value.alternatives).map((item) => asString(item)).filter((item): item is string => Boolean(item)),
    createdAt: asString(value.createdAt) ?? nowIso(),
    savedAt: asString(value.savedAt),
  };
};

export const normalizeGeneratedLocalScenarios = (
  raw: unknown,
  context: LocalScenarioNormalizationContext,
): GeneratedLocalScenarios => {
  const root = isRecord(raw) ? raw : {};
  const rawScenarios = asArray(root.scenarios ?? raw).slice(0, 20);
  if (rawScenarios.length === 0) {
    return { scenarios: [] };
  }

  const scenarios = rawScenarios
    .map((scenario, index) => normalizeScenario(scenario, index, context))
    .filter((scenario): scenario is LocalScenario => Boolean(scenario));

  return { scenarios };
};

const normalizeProposal = (value: unknown): ReplanProposal | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const summary = asString(value.summary);
  if (!summary) {
    return undefined;
  }

  return {
    id: asString(value.id) ?? createClientId("proposal"),
    userId: asString(value.userId) ?? "",
    tripId: asString(value.tripId) ?? "",
    sourceDayId: asString(value.sourceDayId),
    createdAt: asString(value.createdAt) ?? nowIso(),
    reason:
      asString(value.reason) === "unfinished_day" ||
      asString(value.reason) === "weather_change" ||
      asString(value.reason) === "price_change" ||
      asString(value.reason) === "late_start" ||
      asString(value.reason) === "user_request"
        ? (asString(value.reason) as ReplanProposal["reason"])
        : "user_request",
    summary,
    actions: asArray(value.actions)
      .map((action) => {
        if (!isRecord(action)) {
          return null;
        }

        const rationale = asString(action.rationale);
        if (!rationale) {
          return null;
        }

        const typeValue = asString(action.type);
        const type =
          typeValue === "move_activity" || typeValue === "remove_activity" || typeValue === "replace_activity" || typeValue === "compress_day"
            ? typeValue
            : "compress_day";

        const normalizedAction: ReplanAction = {
          id: asString(action.id) ?? createClientId("replan_action"),
          type,
          blockId: asString(action.blockId),
          fromDayId: asString(action.fromDayId),
          toDayId: asString(action.toDayId),
          targetStartTime: asString(action.targetStartTime),
          targetEndTime: asString(action.targetEndTime),
          deleteOriginal: asBoolean(action.deleteOriginal),
          replacementTitle: asString(action.replacementTitle),
          replacementDescription: asString(action.replacementDescription),
          replacementPlace: normalizePlace(action.replacementPlace),
          replacementEstimatedCost: action.replacementEstimatedCost
            ? normalizeCostRange(action.replacementEstimatedCost, "EUR")
            : undefined,
          replacementSourceSnapshots: asArray(action.replacementSourceSnapshots)
            .map((snapshot) => normalizePlace(snapshot))
            .filter((snapshot): snapshot is PlaceSnapshot => Boolean(snapshot)),
          replacementAlternatives: asArray(action.replacementAlternatives)
            .map((alternative) => normalizeAlternative(alternative, "EUR"))
            .filter((alternative): alternative is ActivityAlternative => Boolean(alternative)),
          rationale,
        };
        return normalizedAction;
      })
      .filter((action): action is ReplanAction => action !== null),
  };
};

export const normalizeChatReplanResponse = (raw: unknown): ChatReplanResponse => {
  const root = isRecord(raw) ? raw : {};
  const proposal = normalizeProposal(root.proposal);
  const structuredPatchSummary = firstString(root.structuredPatchSummary, root.summary);
  const assistantMessage =
    firstString(root.assistantMessage, root.message, root.content, structuredPatchSummary, proposal?.summary) ??
    "WanderMint shaped a revised plan.";

  return {
    assistantMessage,
    proposal,
    structuredPatchSummary,
  };
};

export const normalizeLocalScenarioChatResponse = (raw: unknown, context: LocalScenarioNormalizationContext): LocalScenarioChatResponse => {
  const root = isRecord(raw) ? raw : {};
  const assistantMessage =
    firstString(root.assistantMessage, root.message, root.content) ?? "Here is an adjusted idea for your right-now plan.";
  const updatedRaw = root.updatedScenario ?? root.scenario;
  const updatedScenario = updatedRaw ? normalizeScenario(updatedRaw, 0, context) : undefined;

  return {
    assistantMessage,
    updatedScenario: updatedScenario ?? undefined,
  };
};
