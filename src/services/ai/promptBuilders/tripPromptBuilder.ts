import {
  buildReservationHeavyDiscoverySummary,
  buildTripGenerationReservationClause,
} from "../../../features/reservations/reservationHints";
import { buildSafetyPlanningClause } from "../../../features/safety/safetyRules";
import { buildCompactTravelBehaviorAiDirective } from "../../../features/user-behavior/travelBehaviorTripGeneration";
import { buildTripMemoryPromptAppendix } from "../../../features/memory/memoryRepository";
import type { TripDraft } from "../../planning/tripGenerationService";
import type { TripOptionCountPlan } from "../../planning/tripOptionCountService";
import { buildPlanningContext } from "../../planning/planningContextBuilder";
import { buildFlightPlanningClause } from "../../flights/flightPlanningHints";
import { formatStructuredTripEventsForPrompt } from "../../events/tripEventTypes";
import { formatFoodPreferencesForPrompt } from "../../food/foodPreferenceTypes";
import { formatLockedMustSeeForPrompt } from "../../places/placeTypes";
import type { DestinationDiscovery, WeatherContext } from "../../providers/contracts";
import { buildTransportNodePlanningClause } from "../../transport/transportNodePlanning";
import { buildTripGenerationAvoidClause } from "../../preferences/preferenceConstraintsService";
import { mergeFoodDrinkPlannerSettings } from "../../foodCulture/foodCultureDefaults";
import { buildFoodCultureLayer } from "../../foodCulture/foodCultureLayerBuilder";
import { getOrBuildFoodCultureLayer } from "../../foodCulture/foodCultureCache";
import { formatFoodCultureLayersForTripPrompt } from "../../foodCulture/foodCulturePromptForAi";
import { formatStoryTravelPromptAppendix, refineStoryTravelExperiences } from "../../storyTravel/storyTravelAiLayer";
import { mergeStoryTravelPreferences } from "../../storyTravel/storyTravelDefaults";
import { storySuggestionsForTripDraft } from "../../storyTravel/storyTravelSuggestionService";
import type { PlanningContextWidgetModel } from "../../../features/planning-context/planningContext.types";

const summarizeDiscovery = (discovery: DestinationDiscovery): string => {
  const summarizeItems = (label: string, items: DestinationDiscovery[keyof Pick<DestinationDiscovery, "attractions" | "museums" | "localFood" | "traditionalDrinks" | "nearbyPlaces" | "dayTrips" | "mustSee">]): string =>
    `${label}: ${items.slice(0, 8).map((item) => `${item.title} (${item.sourceName}, ${item.confidence})`).join("; ") || "none"}`;

  return [
    summarizeItems("Attractions", discovery.attractions),
    summarizeItems("Museums", discovery.museums),
    summarizeItems("Local food", discovery.localFood),
    summarizeItems("Traditional drinks", discovery.traditionalDrinks),
    summarizeItems("Nearby places", discovery.nearbyPlaces),
    summarizeItems("Day trips", discovery.dayTrips),
    summarizeItems("User must-see parsed items", discovery.mustSee),
  ].join("\n");
};

export type TripGenerationPromptExtras = {
  tripOptionPlan: TripOptionCountPlan;
  accommodationSummary?: string;
  planningContextOpenData?: PlanningContextWidgetModel;
};

export const buildTripGenerationPrompt = (
  draft: TripDraft,
  weather: WeatherContext[],
  discovery: DestinationDiscovery,
  extras: TripGenerationPromptExtras,
): string => {
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
  const travelBehaviorDirective = buildCompactTravelBehaviorAiDirective(
    draft.travelBehaviorProfile ?? null,
    draft.travelBehaviorGenerationPlan ?? null,
  );
  const reservationDiscovery = buildReservationHeavyDiscoverySummary(discovery);
  const reservationClause = buildTripGenerationReservationClause();
  const safetyClause = buildSafetyPlanningClause();
  const timelineRegeneration =
    draft.timelineRegenerationHints && draft.timelineRegenerationHints.length > 0
      ? `The last generated itinerary still failed deterministic timeline checks after automatic repair. Fix these issues before returning JSON — shorten days, add buffers, and align clock gaps with travel plus default slack: ${draft.timelineRegenerationHints.join(" | ")}`
      : "";
  const weatherSummary = weather.map((item) => `${item.locationLabel}: ${item.condition}, ${item.precipitationChance}% rain`).join("; ");
  const segmentTransitionSummary = draft.tripSegments
    .slice(0, -1)
    .map((segment, index) => {
      const nextSegment = draft.tripSegments[index + 1];
      if (!nextSegment) {
        return null;
      }
      return `${segment.city} -> ${nextSegment.city} transition after ${segment.endDate}, before ${nextSegment.startDate}`;
    })
    .filter((item): item is string => Boolean(item))
    .join(" | ");

  const plan = extras.tripOptionPlan;
  const openData = extras.planningContextOpenData;
  const acc = extras.accommodationSummary?.trim();
  const flightClause = buildFlightPlanningClause(draft);
  const transportClause = buildTransportNodePlanningClause(draft).trim();
  const transportRoutingRule =
    transportClause.length > 0
      ? "When structured intercity transport hubs are listed, honor their exact pins for same-day routing and segment hand-offs — do not substitute different hub names or merge distant terminals without travel time."
      : "";
  const avoidClause = buildTripGenerationAvoidClause(draft.userPreferences?.preferenceProfile).trim();
  const layoverContext = draft.layoverContext;
  const layoverRuleBlock = layoverContext
    ? [
        `Layover context source=${layoverContext.source}; lookupStatus=${layoverContext.flightLookupStatus}; hasLayovers=${layoverContext.hasLayovers}; originalFlightNumbers=${layoverContext.originalFlightNumbers?.join(", ") || "none"}.`,
        layoverContext.segments.length > 0
          ? `Normalized flight segments: ${layoverContext.segments
              .map(
                (segment) =>
                  `${segment.flightNumber} ${segment.departureAirport.code}->${segment.arrivalAirport.code} dep ${segment.scheduledDepartureTime ?? "unknown"} arr ${segment.scheduledArrivalTime ?? "unknown"} status ${segment.status ?? "unknown"} confidence ${segment.dataConfidence} source ${segment.sourceProvider}`,
              )
              .join(" | ")}`
          : "",
        layoverContext.layovers.length > 0
          ? `Layovers: ${layoverContext.layovers
              .map(
                (layover) =>
                  `${layover.airport.code}: duration ${layover.durationMinutes ?? "unknown"}m, usable ${layover.usableFreeTimeMinutes ?? "unknown"}m, feasibility ${layover.feasibility}, buffers exit ${layover.estimatedAirportExitMinutes}m + return ${layover.estimatedReturnBufferMinutes}m + city transfer ${layover.estimatedCityTransferMinutes ?? 0}m, recommendation ${layover.recommendationTitle}`,
              )
              .join(" | ")}`
          : "",
        layoverContext.warnings.length > 0 ? `Layover warnings: ${layoverContext.warnings.join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const foodPlanner = mergeFoodDrinkPlannerSettings(draft.preferences.foodDrinkPlanner);
  const foodCultureLayers = draft.tripSegments
    .filter((s) => s.city.trim() && s.country.trim())
    .map((seg) =>
      getOrBuildFoodCultureLayer({
        city: seg.city,
        country: seg.country,
        planner: foodPlanner,
        foodInterests: draft.preferences.foodInterests,
        avoids: draft.preferences.avoids,
        build: () => buildFoodCultureLayer({ city: seg.city, country: seg.country, planner: foodPlanner }),
      }),
    );
  const foodCultureBlock = formatFoodCultureLayersForTripPrompt(foodCultureLayers, foodPlanner, draft.budget.style);

  const tripDurationDays = ((): number => {
    const a = draft.dateRange.start.trim();
    const b = draft.dateRange.end.trim();
    if (!a || !b) {
      return 3;
    }
    const ms = new Date(b).getTime() - new Date(a).getTime();
    const days = Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
    return Number.isFinite(days) ? Math.max(1, days) : 3;
  })();
  const storyPrefsMerged = mergeStoryTravelPreferences(draft.userPreferences?.storyTravel);
  const primarySeg = draft.tripSegments[0];
  const storyCandidates = storyPrefsMerged.enabled
    ? refineStoryTravelExperiences(
        storySuggestionsForTripDraft(draft, draft.userPreferences ?? null),
        {
          tripDurationDays,
          pace: tempWizardPrefs.pace,
          budgetStyle: draft.budget.style,
          primaryCity: primarySeg?.city,
          primaryCountry: primarySeg?.country,
        },
      )
    : [];
  const storyTravelBlock = formatStoryTravelPromptAppendix(storyCandidates);

  return [
    `Generate between ${plan.min} and ${plan.max} structured future trip options; target ${plan.target} meaningfully different plans (${plan.reason}).`,
    "If fewer genuinely distinct variants are possible without inventing fake logistics, return fewer options rather than padding — at least one complete option is required.",
    "AI may interpret tradeoffs, but factual claims must come from provider snapshots supplied by the application.",
    "FLIGHT + LAYOVER RULES: use flight lookup/manual segment data when present; never invent route/times/status; never claim live status unless explicitly present in provided data.",
    "Never suggest leaving airport for airport_only or short_airport_walk feasibility. Keep buffers conservative (security, immigration, baggage, terminal transfer, return buffer).",
    "If uncertain about connection safety, choose safer recommendation and keep user in-airport or near-airport.",
    "Use destinationDiscovery as the grounding layer for attractions, museums, local food, traditional drinks, nearby places, day trips, and user must-see requests.",
    "If a user must-see item has low confidence or weak provider grounding, keep it as a preference, propose safer grounded alternatives, and avoid pretending ratings or availability.",
    "Respect locked logistics, budget, pace, avoids, and walking tolerance.",
    avoidClause ? `${avoidClause}` : "",
    avoidClause
      ? "INTERCITY / SURFACE MOVES: never route through, overnight in, or disguise layovers inside any jurisdiction or category listed in the absolute travel blocks above — including indirect corridors or 'just passing through' framing."
      : "",
    "Locked anchor events are immutable: never move them to another date, city, or time slot.",
    draft.planningMode === "event_led" && draft.anchorEvents.length > 0
      ? `STRUCTURED locked trip events (treat as ground truth — never invent different shows, venues, or times):\n${formatStructuredTripEventsForPrompt(draft.anchorEvents)}`
      : "",
    draft.planningMode === "event_led" && draft.anchorEvents.length > 0
      ? "EVENT-LED HARD RULES: Preserve each anchor's exact clock window and municipality. When venue coordinates are present, bias same-day routing around that pin (avoid ping-pong across town before doors). Lighten density in the hours before each anchor and allow recovery after; do not silently drop or replace a locked event with a fictional alternative."
      : "",
    draft.mustSeePlaces && draft.mustSeePlaces.length > 0
      ? `LOCKED must-see entities (include each as a real itinerary stop when physically possible; never silently drop — if logistics fail, spell it out in tradeoffs):\n${formatLockedMustSeeForPrompt(draft.mustSeePlaces)}`
      : "",
    "Plan around venue arrival buffers for anchor events so transport and pre-event flow arrive comfortably before doors/opening.",
    "Treat route coherence as a primary planning factor, not a nice-to-have.",
    "Each day must belong clearly to one trip segment and one city. Use segment-to-segment transitions deliberately instead of making the trip feel like teleporting.",
    "Inside each day, prefer forward-moving geographically coherent sequences with minimal backtracking.",
    "When moving between segments, make the transfer logic visible in the day flow. Respect transfer windows, station or airport friction, and realistic energy after the move.",
    "Only place venues into time slots that plausibly fit their published opening hours. If hours are unclear, say so and avoid overclaiming.",
    "Respect dayparts: avoid framing a calm coffee as the hero stop very late at night; avoid alcohol-forward mornings unless the day is clearly brunch/lunch aperitivo. Multi-day trips may be a bit more relaxed than a single right-now evening, but still keep stops believable for their clock time.",
    "Enforce category variety across food, drink, museum, gallery, walk, landmark, event, and transfer.",
    "Do not place three food-oriented stops in a row unless the user explicitly wants a food crawl, tasting route, or bar crawl.",
    "If a day is culture-heavy, break it with a walk, landmark, cafe, or meaningful transition instead of repeating the same category bluntly.",
    `Planning mode: ${draft.planningMode === "event_led" ? "event-led route built around locked anchors" : "city-first route built around chosen segments"}`,
    `Destination: ${draft.destination}`,
    `Trip segments: ${draft.tripSegments.map((segment) => `${segment.city}, ${segment.country} (${segment.startDate} to ${segment.endDate}) base ${segment.hotelInfo.name ?? "not provided"}`).join(" | ")}`,
    acc ? `Structured accommodation bases (when set): ${acc}` : "",
    transportClause ? `${transportClause}` : "",
    transportRoutingRule,
    `Segment transitions: ${segmentTransitionSummary || "none"}`,
    `Dates: ${draft.dateRange.start} to ${draft.dateRange.end}`,
    flightClause ? flightClause : "",
    layoverRuleBlock ? layoverRuleBlock : "",
    draft.inboundFlight || draft.outboundFlight
      ? "Flight logistics override naive density: honor the arrival/departure buffers above and never invent alternate flights."
      : "",
    `Budget: ${draft.budget.amount} ${draft.budget.currency} ${draft.budget.style}`,
    `Preferred currency: ${planningContext.preferredCurrency ?? draft.budget.currency}`,
    `Budget detail: daily soft ${draft.budget.dailySoftLimit ?? "not set"}, hard cap ${draft.budget.hardCap ?? "not set"}, transport ${draft.budget.transportBudget ?? "not set"}, events ${draft.budget.eventBudget ?? "not set"}`,
    `Party: ${draft.preferences.partyComposition}`,
    `Vibe: ${draft.preferences.vibe.join(", ")}`,
    `My must-sees: ${draft.preferences.mustSeeNotes || "none"}`,
    `Special wishes: ${draft.preferences.specialWishes || "none"}`,
    `Execution profile: speed ${draft.executionProfile.explorationSpeed}, density ${draft.executionProfile.scheduleDensity}, dwell ${draft.executionProfile.attractionDwellStyle}, walking ${draft.executionProfile.walkingTempo}, transfer tolerance ${draft.executionProfile.transferTolerance}, recovery ${draft.executionProfile.recoveryNeed}, event centricity ${draft.executionProfile.eventCentricity}, priority ${draft.executionProfile.priorityMode}`,
    `Anchor events: ${draft.anchorEvents.length > 0 ? draft.anchorEvents.map((event) => `${event.title} at ${event.venue}, ${event.city} on ${event.startAt}, ticket ${event.ticketStatus}, locked ${event.locked}, buffer before ${event.bufferDaysBefore ?? 0}d, buffer after ${event.bufferDaysAfter ?? 0}d`).join(" | ") : "none"}`,
    `Food (flattened): ${draft.preferences.foodInterests.join(", ") || "none"}`,
    draft.foodPreferences && draft.foodPreferences.length > 0
      ? `Food (structured — restaurants are concrete targets; intents are tags for cuisine mix, districts, and meal timing only):\n${formatFoodPreferencesForPrompt(draft.foodPreferences)}`
      : "",
    `Food & drink planner (structured): primary=${foodPlanner.primaryFoodDrinkStrategy}; secondary=${foodPlanner.secondaryFoodDrinkStrategies.join(", ") || "none"}; alcohol=${foodPlanner.includeAlcoholRecommendations}; coffee/tea=${foodPlanner.includeCoffeeTeaRecommendations}; shop tips=${foodPlanner.includeSupermarketShopTips}; practical warnings=${foodPlanner.includePracticalWarnings}; aggressive anti-trap=${foodPlanner.avoidTouristTrapsAggressively}.`,
    foodCultureBlock,
    `Avoids: ${draft.preferences.avoids.join(", ")}`,
    `Weather provider context: ${weatherSummary}`,
    openData
      ? `Open-data multi-location context: locations=${openData.locations.length}; days=${openData.timeWindow.totalDays}; mobility=${openData.mobility.mode}; budget=${openData.budget}.`
      : "",
    openData
      ? `Per-location weather snapshots: ${openData.locations
          .map((loc) => {
            const label = loc.location.label ?? [loc.location.city, loc.location.country].filter(Boolean).join(", ");
            const first = loc.weather?.daily?.[0];
            return `${label}: ${first ? `${first.condition} ${Math.round(first.max)}°/${Math.round(first.min)}°` : "partial context"}`;
          })
          .join(" | ")}`
      : "",
    openData
      ? "When cities differ by weather, adapt each day per city (outdoor in clear cities, indoor in rainy/stormy cities)."
      : "",
    `Destination discovery context:\n${summarizeDiscovery(discovery)}`,
    `Planning memory guidance: ${planningContext.promptGuidance.join(" | ")}`,
    travelBehaviorDirective ? `Learned behavior (compact): ${travelBehaviorDirective}` : "",
    reservationClause,
    safetyClause,
    reservationDiscovery ? reservationDiscovery : "",
    timelineRegeneration,
    draft.memoryLayers ? buildTripMemoryPromptAppendix(draft.memoryLayers) : "",
    draft.bucketListPlanningPromptClause && draft.bucketListPlanningPromptClause.trim().length > 0
      ? `Bucket list (user-saved, prefer when feasible):\n${draft.bucketListPlanningPromptClause.trim()}`
      : "",
    draft.musicPlanningSignals
      ? `Optional music taste (confidence ${draft.musicPlanningSignals.confidence}): scenes ${draft.musicPlanningSignals.scenes.join(" · ")}; vibe: ${draft.musicPlanningSignals.vibe ?? "n/a"}.`
      : "",
    storyTravelBlock ? storyTravelBlock : "",
  ]
    .filter(Boolean)
    .join("\n");
};
