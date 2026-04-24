import type { Trip, TripBudget, TripPreferences, TripSegment } from "../../entities/trip/model";
import type { ActivityAlternative, ActivityBlock, PlaceSnapshot } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import { openAiGatewayClient } from "../ai/openAiGatewayClient";
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

export type TripPlanningMode = "city_first" | "event_led";
export type TripGenerationProgressStep =
  | "validating_trip_shape"
  | "checking_forecast"
  | "finding_city_signals"
  | "finding_local_places"
  | "planning_intercity_moves"
  | "assembling_travel_support"
  | "asking_ai"
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

const normalizeTripDraft = (draft: TripDraft): TripDraft => {
  if (draft.planningMode === "event_led" && draft.anchorEvents.length > 0) {
    const derivedSegments = buildSegmentsFromAnchorEvents(draft.anchorEvents);
    const sortedEvents = sortEventsByStart(draft.anchorEvents);
    return {
      ...draft,
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
    name: event.venue || event.title,
    city: event.city,
    country: event.country,
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

const optimizeGeneratedOptions = async (
  generated: GeneratedTripOptions,
  draft: TripDraft,
  intercityMoves: NonNullable<Trip["intercityMoves"]>,
  travelSupport: NonNullable<Trip["travelSupport"]>,
  forecast: WeatherContext[],
): Promise<GeneratedTripOptions> => {
  const allowFoodCrawl = detectFoodCrawlIntent(
    draft.preferences.vibe.join(" "),
    draft.preferences.foodInterests.join(" "),
    draft.preferences.mustSeeNotes,
    draft.preferences.specialWishes,
  );

  const optimizedOptions = await Promise.all(generated.options.map(async (option) => {
      const days = await Promise.all(option.days.map(async (day) => {
        const normalizedDay = normalizeGeneratedDay(day, option.trip.tripSegments.length > 0 ? option.trip.tripSegments : draft.tripSegments);
        const openingCheckedBlocks = normalizedDay.blocks
          .map((block) => normalizeBlockPricing(block, normalizedDay, draft.budget.style))
          .map((block) => openingHoursService.enrichBlockWithOpenReplacement(block, normalizedDay.date));
        const optimized = optimizeItineraryBlocks(openingCheckedBlocks, {
          allowFoodCrawl,
          preserveAnchors: true,
        });

        return {
          ...normalizedDay,
          blocks: optimized.blocks,
          movementLegs: await movementPlanningService.buildMovementLegs(optimized.blocks),
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

      const normalizedOption = {
        ...option,
        trip: {
          ...option.trip,
          tripSegments: option.trip.tripSegments.length > 0 ? option.trip.tripSegments : draft.tripSegments,
          intercityMoves: option.trip.intercityMoves && option.trip.intercityMoves.length > 0 ? option.trip.intercityMoves : intercityMoves,
          travelSupport: option.trip.travelSupport ?? travelSupport,
        },
        days: injectAnchorEventsIntoDays(days, draft.anchorEvents),
        tradeoffs,
      };

      return tripFeasibilityService.validateGeneratedTripOption(normalizedOption, draft, forecast);
    }));

  return {
    options: optimizedOptions
      .sort((left, right) => right.score - left.score)
      .map((result) => result.option),
  };
};

export const tripGenerationService = {
  generateTripOptions: async (
    draft: TripDraft,
    callbacks?: TripGenerationCallbacks,
  ): Promise<GeneratedTripOptions> => {
    callbacks?.onStep?.("validating_trip_shape");
    const normalizedDraft = normalizeTripDraft(draft);
    const primarySegment = normalizedDraft.tripSegments[0];
    const primaryLocation = primarySegment ? `${primarySegment.city}, ${primarySegment.country}` : normalizedDraft.destination;
    callbacks?.onStep?.("checking_forecast");
    const forecast = await publicWeatherProvider.getForecast(primaryLocation, normalizedDraft.dateRange);
    callbacks?.onStep?.("finding_city_signals");
    const destinationDiscovery = await publicDiscoveryProvider.getDestinationDiscovery({
      locationLabel: normalizedDraft.destination,
      segments: normalizedDraft.tripSegments.map((segment) => ({ city: segment.city, country: segment.country })),
      mustSeeNotes: normalizedDraft.preferences.mustSeeNotes,
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
      query: [normalizedDraft.preferences.vibe.join(", "), normalizedDraft.preferences.mustSeeNotes].filter(Boolean).join(", "),
      categories: ["gallery", "food", "local_food", "traditional_drinks", "museum", "attraction", "cafe"],
      radiusMeters: 5200,
    }).catch(() => discoveryPlaces);
    const prompt = buildTripGenerationPrompt(normalizedDraft, forecast, destinationDiscovery);
    callbacks?.onStep?.("planning_intercity_moves");
    const intercityMoves = await intercityTransportService.createMoves(normalizedDraft.tripSegments, normalizedDraft.budget.currency);
    callbacks?.onStep?.("assembling_travel_support");
    const travelSupport = travelSupportService.createSupportPlan(normalizedDraft.tripSegments, normalizedDraft.executionProfile, normalizedDraft.anchorEvents.length > 0);

    callbacks?.onStep?.("asking_ai");
    const generated = await openAiGatewayClient.generateTripOptions({ draft: normalizedDraft, prompt, forecast, places, destinationDiscovery, intercityMoves, travelSupport });
    callbacks?.onStep?.("validating_trip_feasibility");
    return await optimizeGeneratedOptions(generated, normalizedDraft, intercityMoves, travelSupport, forecast);
  },
};
