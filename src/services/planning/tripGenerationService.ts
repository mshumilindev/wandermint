import type { Trip, TripBudget, TripPlanningMode, TripPreferences, TripSegment } from "../../entities/trip/model";
import type { ActivityAlternative, ActivityBlock, PlaceSnapshot } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { FlickSyncLibraryItem } from "../../entities/flicksync/model";
import type { PlaceExperienceMemory } from "../../entities/place-memory/model";
import type { TravelMemory } from "../../entities/travel-memory/model";
import type { UserPreferences } from "../../entities/user/model";
import { openAiGatewayClient } from "../ai/openAiGatewayClient";
import { compactAccommodationBasesForAi } from "../ai/aiContextCompaction";
import { buildTripGenerationPrompt } from "../ai/promptBuilders/tripPromptBuilder";
import type { GeneratedTripOptions } from "../ai/schemas";
import { publicDiscoveryProvider } from "../providers/publicDiscoveryProvider";
import { publicPlacesProvider } from "../providers/publicPlacesProvider";
import { publicWeatherProvider } from "../providers/publicWeatherProvider";
import { pricingService } from "../pricing/pricingService";
import { intercityTransportService } from "../travel-intelligence/intercityTransportService";
import { travelSupportService } from "../travel-intelligence/travelSupportService";
import { detectFoodCrawlIntent, optimizeItineraryBlocks, scoreItineraryComposition } from "./itineraryCompositionService";
import { movementPlanningService } from "./movementPlanningService";
import { openingHoursService } from "./openingHoursService";
import { tripFeasibilityService } from "./tripFeasibilityService";
import type { WeatherContext } from "../providers/contracts";
import { createClientId } from "../../shared/lib/id";
import { AiGatewayError, AiValidationError, ProviderUnavailableError } from "../../shared/lib/appErrors";
import { debugLogError } from "../../shared/lib/errors";
import { flickSyncLibraryRepository } from "../flicksync/flickSyncLibraryRepository";
import { applyTravelBehaviorToTripDraft } from "../../features/user-behavior/travelBehaviorCalculator";
import type { TravelBehaviorProfile } from "../../features/user-behavior/travelBehavior.types";
import {
  buildTimelineRegenerationHints,
  repairDayPlanForTimeline,
  timelineValidationForDayPlan,
} from "../../features/trip-planning/timeline/timelineValidator";
import { resolvePlanTimezone } from "../../features/trips/pacing/planTimeUtils";
import {
  applyForceRealisticPacingToDraft,
  buildTravelBehaviorGenerationPlan,
  buildTravelBehaviorUiHintKeys,
  postProcessDayBlocksForTravelBehavior,
  type TravelBehaviorGenerationPlan,
} from "../../features/user-behavior/travelBehaviorTripGeneration";
import { buildPlanningContext } from "./planningContextBuilder";
import { repairDayPlanBudgetIfNeeded, summarizeBudgetValidationForDay, validateDayPlanBudget } from "../../features/budget/budgetValidator";
import { ANALYTICS_EVENTS } from "../../features/observability/analyticsEvents";
import { logAnalyticsEvent } from "../../features/observability/appLogger";
import { collectReservationSameDayRoutingHints } from "../../features/reservations/reservationHints";
import { collectSafetyPlanningTradeoffs } from "../../features/safety/safetyRules";
import { explainTripPlan } from "../../features/explainability/explainTripPlan";
import type { MemoryLayers } from "../../features/memory/memory.types";
import type { TravelTasteProfile } from "../../features/user-taste/travelTaste.types";
import { travelTasteRepository } from "../../features/user-taste/travelTasteRepository";
import { privacySettingsRepository } from "../../features/privacy/privacySettingsRepository";
import { shouldPersistTravelBehaviorProfile } from "../../features/privacy/privacyActions";
import type { BucketListItem } from "../../features/bucket-list/bucketList.types";
import {
  buildBucketListPlanningPromptClause,
  bucketListItemToPlanningPlaceSnapshot,
  fireBucketListEnrichmentForPlanning,
  loadBucketListItemsForTripPlanning,
  mergePlanningPlacesBucketFirst,
} from "../../features/bucket-list/bucketListTripPlanning";
import {
  buildMemoryLayersFromTripDraft,
  loadPersistedMemoryForTripPlanning,
  memoryMetricsToTravelBehaviorProfile,
} from "../../features/memory/memoryRepository";
import type { MusicPlanningSignals } from "../../integrations/music/musicTypes";
import { findMusicEventsForTrip } from "../events/musicEventDiscoveryService";
import type { MusicEventSuggestion } from "../events/musicEventTypes";
import { buildMusicPlanningSignals, getEnabledMusicPersonalization } from "../personalization/music/musicPersonalizationService";
import type { WizardAccommodationBase } from "../accommodation/accommodationTypes";
import { resolveTripOptionCountFromDraft } from "./tripOptionCountService";
import { isDestinationLocationAvoided, mergePreferenceProfile } from "../preferences/preferenceConstraintsService";
import type { FlightSegment, LayoverContext } from "../flights/flightTypes";
import type { FoodPreference } from "../food/foodPreferenceTypes";
import type { TripPlace } from "../places/placeTypes";
import type { SegmentTransportNodes } from "../transport/transportNodeTypes";
import { buildPlanningContextWidgets } from "../../features/planning-context/planningContextBuilder";
import { resolvePlanningLocations } from "../../features/planning-context/resolvePlanningLocations";

export type TripGenerationServiceResult = GeneratedTripOptions & {
  travelBehaviorUiHintKeys: string[];
  musicEventSuggestions?: MusicEventSuggestion[];
};

const buildPartialForecastFallback = (locationLabel: string, dateRange: { start: string; end: string }): WeatherContext[] => {
  const start = new Date(`${dateRange.start}T00:00:00Z`);
  const end = new Date(`${dateRange.end}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [
      {
        locationLabel: `${locationLabel} ${dateRange.start || "date"}`,
        temperatureC: 20,
        condition: "Variable conditions",
        precipitationChance: 20,
        windKph: 10,
        observedAt: new Date().toISOString(),
        certainty: "partial",
      },
    ];
  }
  const out: WeatherContext[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end && out.length < 21) {
    out.push({
      locationLabel: `${locationLabel} ${cursor.toISOString().slice(0, 10)}`,
      temperatureC: 20,
      condition: "Variable conditions",
      precipitationChance: 20,
      windKph: 10,
      observedAt: new Date().toISOString(),
      certainty: "partial",
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

const classifyTripGenerationFailure = (
  error: unknown,
): { errorKind: string; flow?: string; statusCode?: number; errorCode?: string } => {
  if (error instanceof AiGatewayError) {
    return {
      errorKind: error.name,
      flow: error.context.flow ? String(error.context.flow) : undefined,
      statusCode: error.context.statusCode,
      errorCode: error.code,
    };
  }
  if (error instanceof AiValidationError) {
    return {
      errorKind: error.name,
      flow: error.context.flow ? String(error.context.flow) : undefined,
      errorCode: error.code,
    };
  }
  if (error instanceof ProviderUnavailableError) {
    return {
      errorKind: error.name,
      flow: error.context.flow ? String(error.context.flow) : undefined,
      errorCode: error.code,
    };
  }
  if (error instanceof Error) {
    return { errorKind: error.name };
  }
  return { errorKind: "unknown" };
};

export type { TripPlanningMode };
export type TripGenerationProgressStep =
  | "validating_trip_shape"
  | "checking_forecast"
  | "finding_city_signals"
  | "finding_local_places"
  | "planning_intercity_moves"
  | "assembling_travel_support"
  | "asking_ai"
  | "polishing_schedule"
  | "validating_trip_feasibility";

interface TripGenerationCallbacks {
  onStep?: (step: TripGenerationProgressStep) => void;
}

export interface TripDraft {
  userId: string;
  planningMode: TripPlanningMode;
  destination: string;
  tripSegments: TripSegment[];
  dateRange: { start: string; end: string };
  flightInfo: Trip["flightInfo"];
  hotelInfo: Trip["hotelInfo"];
  budget: TripBudget;
  preferences: TripPreferences;
  executionProfile: NonNullable<Trip["executionProfile"]>;
  anchorEvents: NonNullable<Trip["anchorEvents"]>;
  userPreferences?: UserPreferences | null;
  travelMemories?: TravelMemory[];
  placeMemories?: PlaceExperienceMemory[];
  /** FlickSync `profiles/{uid}/library` rows (optional; filled during generation). */
  flickSyncLibraryItems?: FlickSyncLibraryItem[];
  /** Loaded for prompt + execution nudges; not persisted on the trip entity. */
  travelBehaviorProfile?: TravelBehaviorProfile | null;
  /** Derived rules for this generation request only. */
  travelBehaviorGenerationPlan?: TravelBehaviorGenerationPlan | null;
  /** Second-pass trip generation: timeline validator feedback for the model. */
  timelineRegenerationHints?: string[];
  /** Separated memory domains for prompts and planning (built during generation). */
  memoryLayers?: MemoryLayers | null;
  /** Learned experience preferences (ranking only; separate from travel-behavior pacing). */
  travelTasteProfile?: TravelTasteProfile | null;
  /** Bucket list rows injected into this generation pass (not persisted on trip). */
  bucketListConsideredForPlanning?: BucketListItem[];
  /** Extra prompt clause for the model (derived from bucket list). */
  bucketListPlanningPromptClause?: string;
  /** Optional summarized music taste for prompts + soft ranking only. */
  musicPlanningSignals?: MusicPlanningSignals | null;
  /** Wizard-only structured accommodation picks per segment (not persisted verbatim on Trip). */
  segmentAccommodationBases?: Partial<Record<string, WizardAccommodationBase>>;
  /** Wizard-only pinned intercity hubs (stations, ports, ferry terminals) per segment — affects prompts and move distance heuristics. */
  segmentTransportNodes?: Partial<Record<string, SegmentTransportNodes>>;
  /** Structured locked must-see anchors; `preferences.mustSeeNotes` should stay in sync for discovery. */
  mustSeePlaces?: TripPlace[];
  /** Dual food model: named restaurants vs tag-only intents; keep `preferences.foodInterests` derived in the wizard. */
  foodPreferences?: FoodPreference[];
  /** Structured inbound (to destination) / outbound (return) legs for flight-aware prompts. */
  inboundFlight?: FlightSegment;
  outboundFlight?: FlightSegment;
  /** Raw user input for lookup parser. */
  flightLookupInput?: string;
  /** Structured lookup + layover analysis for AI/context widgets. */
  layoverContext?: LayoverContext;
}

const sortEventsByStart = (events: NonNullable<Trip["anchorEvents"]>): NonNullable<Trip["anchorEvents"]> =>
  [...events].sort((left, right) => left.startAt.localeCompare(right.startAt));

const shiftIsoDate = (date: string, deltaDays: number): string => {
  const source = new Date(`${date}T00:00:00Z`);
  source.setUTCDate(source.getUTCDate() + deltaDays);
  return source.toISOString().slice(0, 10);
};

const buildSegmentsFromAnchorEvents = (events: NonNullable<Trip["anchorEvents"]>): TripSegment[] => {
  const sortedEvents = sortEventsByStart(events);
  const groupedByLocation = new Map<string, TripSegment>();
  const orderedKeys: string[] = [];

  sortedEvents.forEach((event) => {
    const eventDate = event.startAt.slice(0, 10);
    const beforeBuffer = Math.max(0, event.bufferDaysBefore ?? 0);
    const afterBuffer = Math.max(0, event.bufferDaysAfter ?? 0);
    const startDate = shiftIsoDate(eventDate, -beforeBuffer);
    const endDate = shiftIsoDate(eventDate, afterBuffer);
    const key = `${event.city.trim().toLowerCase()}|${event.country.trim().toLowerCase()}`;
    const existing = groupedByLocation.get(key);
    const anchorNote = `Locked anchor: ${event.title}${event.venue ? ` at ${event.venue}` : ""} (${eventDate})`;

    if (!existing) {
      groupedByLocation.set(key, {
        id: `segment-${event.id}`,
        city: event.city,
        country: event.country,
        startDate,
        endDate,
        hotelInfo: {},
        arrivalTransportNotes: `Trip shaped around ${anchorNote}.`,
        departureTransportNotes: "",
      });
      orderedKeys.push(key);
      return;
    }

    existing.startDate = startDate < existing.startDate ? startDate : existing.startDate;
    existing.endDate = endDate > existing.endDate ? endDate : existing.endDate;
    existing.departureTransportNotes = `${existing.departureTransportNotes ? `${existing.departureTransportNotes} ` : ""}${anchorNote}.`.trim();
  });

  return orderedKeys
    .map((key) => groupedByLocation.get(key))
    .filter((segment): segment is TripSegment => Boolean(segment))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
};

const assertTripDraftSatisfiesAvoidConstraints = (tripDraft: TripDraft): void => {
  const profile = mergePreferenceProfile(tripDraft.userPreferences?.preferenceProfile ?? null);
  if (!profile.avoid.length) {
    return;
  }
  for (const segment of tripDraft.tripSegments) {
    const country = segment.country?.trim() ?? "";
    if (!country) {
      continue;
    }
    if (isDestinationLocationAvoided(profile, { country, city: segment.city })) {
      throw new AiValidationError(
        `This route includes a destination that is blocked in your account settings (${[segment.city?.trim(), country].filter(Boolean).join(", ")}). Change the route or remove the block in Settings before generating.`,
        { flow: "trip_generation" },
      );
    }
  }
  for (const event of tripDraft.anchorEvents ?? []) {
    const country = event.country?.trim() ?? "";
    if (!country) {
      continue;
    }
    if (isDestinationLocationAvoided(profile, { country, city: event.city })) {
      throw new AiValidationError(
        `A locked anchor is in a blocked destination (${[event.city?.trim(), country].filter(Boolean).join(", ")}).`,
        { flow: "trip_generation" },
      );
    }
  }
  const nodes = tripDraft.segmentTransportNodes ?? {};
  for (const segment of tripDraft.tripSegments) {
    const row = nodes[segment.id];
    for (const node of [row?.entry, row?.exit]) {
      if (!node) {
        continue;
      }
      const hubCountry = node.place.country?.trim() ?? "";
      const hubCity = node.place.city?.trim() ?? "";
      if (hubCountry && isDestinationLocationAvoided(profile, { country: hubCountry, city: hubCity || undefined })) {
        throw new AiValidationError(
          `Pinned transport hub "${node.place.name}" is in a blocked area (${[hubCity, hubCountry].filter(Boolean).join(", ")}). Clear that hub or adjust your travel blocks.`,
          { flow: "trip_generation" },
        );
      }
    }
  }
};

const normalizeTripDraft = (draft: TripDraft): TripDraft => {
  const tempWizardPrefs = draft.memoryLayers?.temporaryTripPreferences.preferences ?? draft.preferences;
  const planningContext = buildPlanningContext({
    globalUserPreferences: draft.userPreferences,
    userPreferences: draft.userPreferences,
    temporaryTripWizardPreferences: tempWizardPrefs,
    travelMemories: draft.travelMemories,
    placeMemories: draft.placeMemories,
    draft: { preferences: tempWizardPrefs, budget: draft.budget, mustSeePlaces: draft.mustSeePlaces },
    flickSyncLibraryItems: draft.flickSyncLibraryItems,
    musicPlanningSignals: draft.musicPlanningSignals ?? null,
  });
  const budget = planningContext.preferredCurrency
    ? { ...draft.budget, currency: planningContext.preferredCurrency }
    : draft.budget;

  if (draft.planningMode === "event_led" && draft.anchorEvents.length > 0) {
    const derivedSegments = buildSegmentsFromAnchorEvents(draft.anchorEvents);
    const sortedEvents = sortEventsByStart(draft.anchorEvents);
    return {
      ...draft,
      budget,
      tripSegments: derivedSegments,
      destination: derivedSegments.map((segment) => segment.city).join(" → "),
      dateRange: {
        start: derivedSegments[0]?.startDate ?? sortedEvents[0]?.startAt.slice(0, 10) ?? draft.dateRange.start,
        end: derivedSegments.at(-1)?.endDate ?? sortedEvents.at(-1)?.endAt?.slice(0, 10) ?? sortedEvents.at(-1)?.startAt.slice(0, 10) ?? draft.dateRange.end,
      },
    };
  }

  return {
    ...draft,
    budget,
    destination: draft.destination || draft.tripSegments.map((segment) => segment.city.trim()).filter(Boolean).join(" → "),
  };
};

const findSegmentForDay = (day: DayPlan, segments: TripSegment[]): TripSegment | undefined => {
  const segmentById = segments.find((segment) => segment.id === day.segmentId);
  if (segmentById) {
    return segmentById;
  }

  const sameCitySegment = segments.find((segment) => segment.city.trim().toLowerCase() === day.cityLabel.trim().toLowerCase());
  if (sameCitySegment) {
    return sameCitySegment;
  }

  return segments.find((segment) => day.date >= segment.startDate && day.date <= segment.endDate);
};

const normalizeGeneratedDay = (day: DayPlan, segments: TripSegment[]): DayPlan => {
  const matchedSegment = findSegmentForDay(day, segments);
  if (!matchedSegment) {
    return day;
  }

  return {
    ...day,
    segmentId: matchedSegment.id,
    cityLabel: matchedSegment.city,
    countryLabel: matchedSegment.country,
  };
};

const createAnchorEventBlock = (event: NonNullable<Trip["anchorEvents"]>[number]): ActivityBlock => ({
  id: createClientId("anchor_block"),
  type: "activity",
  title: event.title,
  description: `Locked event at ${event.venue}. Arrival buffer required before start.`,
  startTime: event.startAt.slice(11, 16) || "19:00",
  endTime: event.endAt?.slice(11, 16) || "22:00",
  category: "event",
  tags: [event.type, "anchor", "locked_event"],
  indoorOutdoor: "mixed",
  estimatedCost: { min: 0, max: 0, currency: "EUR", certainty: "unknown" },
  dependencies: {
    weatherSensitive: false,
    bookingRequired: event.ticketStatus === "booked",
    openingHoursSensitive: false,
    priceSensitive: false,
  },
  alternatives: [],
  sourceSnapshots: [],
  place: {
    provider: "anchor_event",
    providerPlaceId: event.providerEventId,
    name: event.venue || event.title,
    city: event.city,
    country: event.country,
    latitude: event.latitude,
    longitude: event.longitude,
    capturedAt: new Date().toISOString(),
  },
  priority: "must",
  locked: true,
  completionStatus: "pending",
});

const injectAnchorEventsIntoDays = (
  days: DayPlan[],
  anchorEvents: NonNullable<Trip["anchorEvents"]>,
): DayPlan[] => {
  if (anchorEvents.length === 0) {
    return days;
  }

  return days.map((day) => {
    const matchingEvents = anchorEvents.filter((event) => {
      const eventDate = event.startAt.slice(0, 10);
      return (
        eventDate === day.date
        && event.city.trim().toLowerCase() === day.cityLabel.trim().toLowerCase()
        && event.country.trim().toLowerCase() === (day.countryLabel ?? "").trim().toLowerCase()
      );
    });

    if (matchingEvents.length === 0) {
      return day;
    }

    const existingTitles = new Set(day.blocks.map((block) => block.title.trim().toLowerCase()));
    const anchorBlocks = matchingEvents
      .filter((event) => !existingTitles.has(event.title.trim().toLowerCase()))
      .map(createAnchorEventBlock);

    const allBlocks: ActivityBlock[] = [...day.blocks, ...anchorBlocks]
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
      .map((block): ActivityBlock => (block.category === "event" ? { ...block, locked: true, priority: "must" as const } : block));

    return { ...day, blocks: allBlocks };
  });
};

const annotateBlocksWithPlanningContext = (days: DayPlan[], draft: TripDraft): DayPlan[] => {
  const tempWizardPrefs = draft.memoryLayers?.temporaryTripPreferences.preferences ?? draft.preferences;
  const planningContext = buildPlanningContext({
    globalUserPreferences: draft.userPreferences,
    userPreferences: draft.userPreferences,
    temporaryTripWizardPreferences: tempWizardPrefs,
    travelMemories: draft.travelMemories,
    placeMemories: draft.placeMemories,
    draft: { preferences: tempWizardPrefs, budget: draft.budget, mustSeePlaces: draft.mustSeePlaces },
    flickSyncLibraryItems: draft.flickSyncLibraryItems,
    musicPlanningSignals: draft.musicPlanningSignals ?? null,
  });

  return days.map((day) => ({
    ...day,
    blocks: day.blocks.map((block) => {
      const signal = planningContext.scorePlace({
        name: block.place?.name ?? block.title,
        city: block.place?.city ?? day.cityLabel,
        country: block.place?.country ?? day.countryLabel,
      });
      if (!signal.explanation) {
        return block;
      }

      return {
        ...block,
        description: `${block.description}${block.description ? " " : ""}Source note: ${signal.explanation}.`,
      };
    }),
  }));
};

const normalizeAlternativePricing = (
  alternative: ActivityAlternative,
  day: DayPlan,
  budgetStyle: TripBudget["style"],
): ActivityAlternative => ({
  ...alternative,
  estimatedCost: alternative.estimatedCost
    ? pricingService.estimateActivityCost({
        type: "activity",
        category: "alternative",
        place: alternative.place,
        city: day.cityLabel,
        country: day.countryLabel,
        locationLabel: `${day.cityLabel}${day.countryLabel ? `, ${day.countryLabel}` : ""}`,
        budgetStyle,
      })
    : undefined,
});

const normalizeBlockPricing = (
  block: ActivityBlock,
  day: DayPlan,
  budgetStyle: TripBudget["style"],
): ActivityBlock => ({
  ...block,
  estimatedCost: pricingService.estimateActivityCost({
    type: block.type,
    category: block.category,
    place: block.place,
    city: day.cityLabel,
    country: day.countryLabel,
    locationLabel: `${day.cityLabel}${day.countryLabel ? `, ${day.countryLabel}` : ""}`,
    budgetStyle,
  }),
  alternatives: block.alternatives.map((alternative) => normalizeAlternativePricing(alternative, day, budgetStyle)),
});

type OptimizeGeneratedOptionsResult = {
  options: GeneratedTripOptions["options"];
  timelineGlobalHints: string[];
};

const optimizeGeneratedOptions = async (
  generated: GeneratedTripOptions,
  draft: TripDraft,
  intercityMoves: NonNullable<Trip["intercityMoves"]>,
  travelSupport: NonNullable<Trip["travelSupport"]>,
  forecast: WeatherContext[],
): Promise<OptimizeGeneratedOptionsResult> => {
  const allowFoodCrawl = detectFoodCrawlIntent(
    draft.preferences.vibe.join(" "),
    draft.preferences.foodInterests.join(" "),
    (draft.foodPreferences ?? [])
      .map((p) => (p.type === "restaurant" ? p.place.name : `${p.label} ${p.normalizedTags.join(" ")}`))
      .join(" "),
    draft.preferences.mustSeeNotes,
    (draft.mustSeePlaces ?? []).map((p) => p.label).join(" "),
    draft.preferences.specialWishes,
  );

  const optimizedOptions = await Promise.all(generated.options.map(async (option) => {
      const days = await Promise.all(option.days.map(async (day) => {
        const normalizedDay = normalizeGeneratedDay(day, option.trip.tripSegments.length > 0 ? option.trip.tripSegments : draft.tripSegments);
        const segmentTz = resolvePlanTimezone(option.trip, normalizedDay.segmentId);
        const openingCheckedBlocks = normalizedDay.blocks
          .map((block) => normalizeBlockPricing(block, normalizedDay, draft.budget.style))
          .map((block) => openingHoursService.enrichBlockWithOpenReplacement(block, normalizedDay.date, segmentTz));
        const optimized = optimizeItineraryBlocks(openingCheckedBlocks, {
          allowFoodCrawl,
          preserveAnchors: true,
          travelTasteProfile: draft.travelTasteProfile ?? null,
        });
        const behaviorProcessed =
          draft.travelBehaviorGenerationPlan !== undefined && draft.travelBehaviorGenerationPlan !== null
            ? postProcessDayBlocksForTravelBehavior(optimized.blocks, draft.travelBehaviorGenerationPlan)
            : optimized.blocks;

        return {
          ...normalizedDay,
          blocks: behaviorProcessed,
          movementLegs: await movementPlanningService.buildMovementLegs(behaviorProcessed),
        };
      }));

      const routeSignals = days
        .map((day) => scoreItineraryComposition(day.blocks, { allowFoodCrawl, preserveAnchors: true }))
        .filter((metrics) => metrics.repetitionPenalty > 0 || metrics.backtrackingPenalty > 0 || metrics.coherencePenalty > 260);

      const tradeoffs = [
        ...option.tradeoffs,
        ...routeSignals.slice(0, 2).map((metrics) =>
          metrics.repetitionPenalty >= metrics.backtrackingPenalty
            ? "A few stops still cluster around one mood, but the route keeps the day grounded."
            : "One part of the day stretches a bit farther so the strongest nearby picks still fit together.",
        ),
      ].filter((item, index, values) => values.indexOf(item) === index);

      const contextAwareDays = annotateBlocksWithPlanningContext(injectAnchorEventsIntoDays(days, draft.anchorEvents), draft);
      const timelineReadyDays = await Promise.all(
        contextAwareDays.map(async (day) => {
          const validation = timelineValidationForDayPlan(day);
          if (validation.isFeasible) {
            return day;
          }
          return repairDayPlanForTimeline(day, validation);
        }),
      );
      const timelineHints = buildTimelineRegenerationHints(timelineReadyDays);
      const timelineTradeoffs = timelineHints.map((hint) => `Timeline (post-repair review): ${hint}`);

      for (const day of timelineReadyDays) {
        const timelineCheck = timelineValidationForDayPlan(day);
        if (!timelineCheck.isFeasible || timelineCheck.warnings.some((w) => w.severity === "high")) {
          logAnalyticsEvent(ANALYTICS_EVENTS.trip_timeline_infeasible, {
            dayId: day.id,
            date: day.date,
            overloadMinutes: timelineCheck.overloadMinutes,
            warningTypes: [...new Set(timelineCheck.warnings.map((w) => w.type))],
            warningHighCount: timelineCheck.warnings.filter((w) => w.severity === "high").length,
            isFeasible: timelineCheck.isFeasible,
          });
        }
      }

      const budgetRepairedDays = timelineReadyDays.map((day) => {
        const budgetCheck = validateDayPlanBudget(day, draft.budget);
        if (budgetCheck.suspiciousItems.length > 0) {
          logAnalyticsEvent(ANALYTICS_EVENTS.budget_suspicious, {
            dayId: day.id,
            suspiciousCount: budgetCheck.suspiciousItems.length,
            blockCount: day.blocks.length,
            currency: budgetCheck.currency,
          });
        }
        return repairDayPlanBudgetIfNeeded(day, draft.budget);
      });
      const budgetTradeoffs = budgetRepairedDays
        .flatMap((day) => summarizeBudgetValidationForDay(day, draft.budget))
        .map((line) => `Budget (post-repair review): ${line}`);

      const reservationTradeoffs = budgetRepairedDays
        .flatMap((day) => collectReservationSameDayRoutingHints(day))
        .map((line) => `Reservations (review): ${line}`);

      const safetyTradeoffs = budgetRepairedDays.flatMap((day) => collectSafetyPlanningTradeoffs(day));

      const normalizedOption = {
        ...option,
        trip: {
          ...option.trip,
          tripSegments: option.trip.tripSegments.length > 0 ? option.trip.tripSegments : draft.tripSegments,
          intercityMoves: option.trip.intercityMoves && option.trip.intercityMoves.length > 0 ? option.trip.intercityMoves : intercityMoves,
          travelSupport: option.trip.travelSupport ?? travelSupport,
        },
        days: budgetRepairedDays,
        tradeoffs: [...tradeoffs, ...timelineTradeoffs, ...budgetTradeoffs, ...reservationTradeoffs, ...safetyTradeoffs],
      };

      const feasibility = tripFeasibilityService.validateGeneratedTripOption(
        normalizedOption,
        draft,
        forecast,
        draft.travelBehaviorGenerationPlan ?? null,
      );
      const planExplanation = explainTripPlan({
        option: feasibility.option,
        draft,
        feasibilityWarnings: feasibility.warnings,
      });
      return {
        ...feasibility,
        option: { ...feasibility.option, planExplanation },
        timelineHints,
      };
    }));

  const timelineGlobalHints = [...new Set(optimizedOptions.flatMap((row) => row.timelineHints))];

  return {
    options: optimizedOptions
      .sort((left, right) => right.score - left.score)
      .map((result) => result.option),
    timelineGlobalHints,
  };
};

export const tripGenerationService = {
  generateTripOptions: async (
    draft: TripDraft,
    callbacks?: TripGenerationCallbacks,
  ): Promise<TripGenerationServiceResult> => {
    callbacks?.onStep?.("validating_trip_shape");
    const normalizedDraft = normalizeTripDraft(draft);
    try {
    const flickSyncLibraryItems =
      normalizedDraft.userId.trim().length > 0 ? await flickSyncLibraryRepository.getUserLibrary(normalizedDraft.userId) : [];
    const persistedMemory =
      normalizedDraft.userId.trim().length > 0
        ? await loadPersistedMemoryForTripPlanning(normalizedDraft.userId).catch(() => ({
            globalUserPreferences: null,
            travelBehaviorMetrics: null,
            tripReviewSummary: null,
          }))
        : { globalUserPreferences: null, travelBehaviorMetrics: null, tripReviewSummary: null };
    const memoryLayers = buildMemoryLayersFromTripDraft(normalizedDraft, persistedMemory);
    const privacyForLearning =
      normalizedDraft.userId.trim().length > 0
        ? await privacySettingsRepository.getPrivacySettings(normalizedDraft.userId).catch(() => null)
        : null;
    const travelTasteProfile =
      normalizedDraft.userId.trim().length > 0 && shouldPersistTravelBehaviorProfile(privacyForLearning)
        ? await travelTasteRepository.getProfile(normalizedDraft.userId).catch(() => null)
        : null;
    const travelBehaviorProfile =
      persistedMemory.travelBehaviorMetrics !== null
        ? memoryMetricsToTravelBehaviorProfile(persistedMemory.travelBehaviorMetrics)
        : null;
    const behaviorPlan = buildTravelBehaviorGenerationPlan(travelBehaviorProfile, normalizedDraft.executionProfile);
    let generationDraft: TripDraft = {
      ...normalizedDraft,
      flickSyncLibraryItems,
      travelBehaviorProfile,
      travelBehaviorGenerationPlan: behaviorPlan,
      memoryLayers,
      travelTasteProfile,
    };
    if (travelBehaviorProfile && travelBehaviorProfile.totalTrips > 0) {
      generationDraft = {
        ...generationDraft,
        ...applyTravelBehaviorToTripDraft(generationDraft, travelBehaviorProfile),
      };
    }
    if (behaviorPlan?.forceRealisticPacing) {
      generationDraft = applyForceRealisticPacingToDraft(generationDraft);
    }
    assertTripDraftSatisfiesAvoidConstraints(generationDraft);
    const primarySegment = generationDraft.tripSegments[0];
    const primaryLocation = primarySegment ? `${primarySegment.city}, ${primarySegment.country}` : generationDraft.destination;
    const openDataPlanningContext = await buildPlanningContextWidgets({
      flow: "create_plan",
      locations: resolvePlanningLocations("create_plan", {
        segments: generationDraft.tripSegments.map((segment) => ({
          id: segment.id,
          city: segment.city,
          country: segment.country,
        })),
      }),
      startDate: generationDraft.dateRange.start,
      endDate: generationDraft.dateRange.end,
      budgetAmount: generationDraft.budget.amount,
    }).catch(() => null);
    callbacks?.onStep?.("checking_forecast");
    const forecast = await publicWeatherProvider.getForecast(primaryLocation, generationDraft.dateRange).catch((error) => {
      debugLogError("trip_generation_forecast_fallback", error);
      return buildPartialForecastFallback(primaryLocation, generationDraft.dateRange);
    });
    callbacks?.onStep?.("finding_city_signals");
    const mustSeeForDiscovery = [
      generationDraft.preferences.mustSeeNotes,
      ...(generationDraft.mustSeePlaces ?? []).map((p) => p.label),
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("; ");
    const destinationDiscovery = await publicDiscoveryProvider.getDestinationDiscovery({
      locationLabel: generationDraft.destination,
      segments: generationDraft.tripSegments.map((segment) => ({ city: segment.city, country: segment.country })),
      mustSeeNotes: mustSeeForDiscovery,
    });
    const discoveryPlaces = [
      ...destinationDiscovery.attractions,
      ...destinationDiscovery.museums,
      ...destinationDiscovery.localFood,
      ...destinationDiscovery.traditionalDrinks,
      ...destinationDiscovery.nearbyPlaces,
      ...destinationDiscovery.dayTrips,
    ].map((item) => item.place).filter((place): place is PlaceSnapshot => Boolean(place));
    callbacks?.onStep?.("finding_local_places");
    const places = await publicPlacesProvider.searchPlaces({
      locationLabel: primaryLocation,
      query: [
        generationDraft.preferences.vibe.join(", "),
        generationDraft.preferences.mustSeeNotes,
        ...(generationDraft.mustSeePlaces ?? []).map((p) => p.label),
      ]
        .filter(Boolean)
        .join(", "),
      categories: ["gallery", "food", "local_food", "traditional_drinks", "museum", "attraction", "cafe"],
      radiusMeters: 5200,
    }).catch((error) => {
      debugLogError("trip_generation_places_search_fallback", error);
      return discoveryPlaces;
    });

    let bucketListConsidered: BucketListItem[] = [];
    let placesForAi = places;
    if (generationDraft.userId.trim().length > 0) {
      bucketListConsidered = await loadBucketListItemsForTripPlanning(generationDraft.userId, generationDraft.tripSegments);
      if (bucketListConsidered.length > 0) {
        const bucketSnapshots = bucketListConsidered.map(bucketListItemToPlanningPlaceSnapshot);
        placesForAi = mergePlanningPlacesBucketFirst(bucketSnapshots, places);
        fireBucketListEnrichmentForPlanning(bucketListConsidered);
        generationDraft = {
          ...generationDraft,
          bucketListConsideredForPlanning: bucketListConsidered,
          bucketListPlanningPromptClause: buildBucketListPlanningPromptClause(bucketListConsidered),
        };
      }
    }

    let musicEventSuggestions: MusicEventSuggestion[] = [];
    if (generationDraft.userId.trim()) {
      try {
        const mp = await getEnabledMusicPersonalization(generationDraft.userId);
        if (mp.profile && mp.settings.useMusicTastePersonalization) {
          const signals = await buildMusicPlanningSignals(
            mp.profile,
            mp.planningConfidence,
            mp.settings.allowAiMusicInterpretation,
          );
          generationDraft = { ...generationDraft, musicPlanningSignals: signals };
          if (mp.settings.allowConcertSuggestions) {
            musicEventSuggestions = await findMusicEventsForTrip({
              trip: {
                destination: generationDraft.destination,
                tripSegments: generationDraft.tripSegments,
                dateRange: generationDraft.dateRange,
              },
              profile: mp.profile,
            }).catch(() => []);
          }
        }
      } catch {
        /* music layer is optional — never block trip generation */
      }
    }

    callbacks?.onStep?.("planning_intercity_moves");
    const intercityMoves = await intercityTransportService.createMoves(
      generationDraft.tripSegments,
      generationDraft.budget.currency,
      generationDraft.segmentTransportNodes,
    );
    callbacks?.onStep?.("assembling_travel_support");
    const travelSupport = travelSupportService.createSupportPlan(generationDraft.tripSegments, generationDraft.executionProfile, generationDraft.anchorEvents.length > 0);

    const missingCriticalDetails = generationDraft.tripSegments.some(
      (s) => !s.city.trim() || !s.country.trim() || !s.startDate.trim() || !s.endDate.trim(),
    );
    const tripOptionPlan = resolveTripOptionCountFromDraft(
      {
        planningMode: generationDraft.planningMode,
        dateRange: generationDraft.dateRange,
        tripSegments: generationDraft.tripSegments,
        anchorEvents: generationDraft.anchorEvents,
      },
      { missingCriticalDetails },
    );
    const accommodationSummary = compactAccommodationBasesForAi(generationDraft);

    let timelineRegenerationHints: string[] | undefined;
    let optimizedBundle: OptimizeGeneratedOptionsResult | null = null;
    for (let timelineAttempt = 0; timelineAttempt < 2; timelineAttempt += 1) {
      if (timelineAttempt > 0 && (!timelineRegenerationHints || timelineRegenerationHints.length === 0)) {
        break;
      }
      const draftForAi: TripDraft =
        timelineAttempt === 0 ? generationDraft : { ...generationDraft, timelineRegenerationHints: timelineRegenerationHints! };
      const prompt = buildTripGenerationPrompt(draftForAi, forecast, destinationDiscovery, {
        tripOptionPlan,
        accommodationSummary,
        planningContextOpenData: openDataPlanningContext ?? undefined,
      });
      callbacks?.onStep?.("asking_ai");
      const gatewayDraft: TripDraft = { ...draftForAi };
      delete gatewayDraft.travelTasteProfile;
      delete gatewayDraft.memoryLayers;
      delete gatewayDraft.bucketListConsideredForPlanning;
      delete gatewayDraft.bucketListPlanningPromptClause;
      delete gatewayDraft.musicPlanningSignals;
      delete gatewayDraft.segmentAccommodationBases;
      delete gatewayDraft.segmentTransportNodes;
      delete gatewayDraft.mustSeePlaces;
      delete gatewayDraft.foodPreferences;
      delete gatewayDraft.inboundFlight;
      delete gatewayDraft.outboundFlight;
      const generated = await openAiGatewayClient.generateTripOptions({
        draft: gatewayDraft,
        prompt,
        planningContext: openDataPlanningContext ?? undefined,
        forecast,
        places: placesForAi,
        destinationDiscovery,
        intercityMoves,
        travelSupport,
        tripOptionPlan,
      });
      callbacks?.onStep?.("polishing_schedule");
      optimizedBundle = await optimizeGeneratedOptions(generated, draftForAi, intercityMoves, travelSupport, forecast);
      callbacks?.onStep?.("validating_trip_feasibility");
      if (optimizedBundle.timelineGlobalHints.length === 0) {
        break;
      }
      timelineRegenerationHints = optimizedBundle.timelineGlobalHints;
    }

    if (!optimizedBundle || optimizedBundle.options.length === 0) {
      throw new Error("Trip generation produced no options.");
    }

    return {
      options: optimizedBundle.options,
      travelBehaviorUiHintKeys: buildTravelBehaviorUiHintKeys(behaviorPlan),
      musicEventSuggestions,
    };
    } catch (error) {
      logAnalyticsEvent(ANALYTICS_EVENTS.ai_flow_failed, {
        ...classifyTripGenerationFailure(error),
        userIdPresent: normalizedDraft.userId.trim().length > 0,
      });
      throw error;
    }
  },
};
