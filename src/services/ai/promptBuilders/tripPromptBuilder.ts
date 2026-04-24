import type { TripDraft } from "../../planning/tripGenerationService";
import type { DestinationDiscovery, WeatherContext } from "../../providers/contracts";

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

export const buildTripGenerationPrompt = (draft: TripDraft, weather: WeatherContext[], discovery: DestinationDiscovery): string => {
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

  return [
    "Generate exactly three structured future trip options.",
    "AI may interpret tradeoffs, but factual claims must come from provider snapshots supplied by the application.",
    "Use destinationDiscovery as the grounding layer for attractions, museums, local food, traditional drinks, nearby places, day trips, and user must-see requests.",
    "If a user must-see item has low confidence or weak provider grounding, keep it as a preference, propose safer grounded alternatives, and avoid pretending ratings or availability.",
    "Respect locked logistics, budget, pace, avoids, and walking tolerance.",
    "Locked anchor events are immutable: never move them to another date, city, or time slot.",
    "Plan around venue arrival buffers for anchor events so transport and pre-event flow arrive comfortably before doors/opening.",
    "Treat route coherence as a primary planning factor, not a nice-to-have.",
    "Each day must belong clearly to one trip segment and one city. Use segment-to-segment transitions deliberately instead of making the trip feel like teleporting.",
    "Inside each day, prefer forward-moving geographically coherent sequences with minimal backtracking.",
    "When moving between segments, make the transfer logic visible in the day flow. Respect transfer windows, station or airport friction, and realistic energy after the move.",
    "Only place venues into time slots that plausibly fit their published opening hours. If hours are unclear, say so and avoid overclaiming.",
    "Enforce category variety across food, drink, museum, gallery, walk, landmark, event, and transfer.",
    "Do not place three food-oriented stops in a row unless the user explicitly wants a food crawl, tasting route, or bar crawl.",
    "If a day is culture-heavy, break it with a walk, landmark, cafe, or meaningful transition instead of repeating the same category bluntly.",
    `Planning mode: ${draft.planningMode === "event_led" ? "event-led route built around locked anchors" : "city-first route built around chosen segments"}`,
    `Destination: ${draft.destination}`,
    `Trip segments: ${draft.tripSegments.map((segment) => `${segment.city}, ${segment.country} (${segment.startDate} to ${segment.endDate}) base ${segment.hotelInfo.name ?? "not provided"}`).join(" | ")}`,
    `Segment transitions: ${segmentTransitionSummary || "none"}`,
    `Dates: ${draft.dateRange.start} to ${draft.dateRange.end}`,
    `Budget: ${draft.budget.amount} ${draft.budget.currency} ${draft.budget.style}`,
    `Budget detail: daily soft ${draft.budget.dailySoftLimit ?? "not set"}, hard cap ${draft.budget.hardCap ?? "not set"}, transport ${draft.budget.transportBudget ?? "not set"}, events ${draft.budget.eventBudget ?? "not set"}`,
    `Party: ${draft.preferences.partyComposition}`,
    `Vibe: ${draft.preferences.vibe.join(", ")}`,
    `My must-sees: ${draft.preferences.mustSeeNotes || "none"}`,
    `Special wishes: ${draft.preferences.specialWishes || "none"}`,
    `Execution profile: speed ${draft.executionProfile.explorationSpeed}, density ${draft.executionProfile.scheduleDensity}, dwell ${draft.executionProfile.attractionDwellStyle}, walking ${draft.executionProfile.walkingTempo}, transfer tolerance ${draft.executionProfile.transferTolerance}, recovery ${draft.executionProfile.recoveryNeed}, event centricity ${draft.executionProfile.eventCentricity}, priority ${draft.executionProfile.priorityMode}`,
    `Anchor events: ${draft.anchorEvents.length > 0 ? draft.anchorEvents.map((event) => `${event.title} at ${event.venue}, ${event.city} on ${event.startAt}, ticket ${event.ticketStatus}, locked ${event.locked}, buffer before ${event.bufferDaysBefore ?? 0}d, buffer after ${event.bufferDaysAfter ?? 0}d`).join(" | ") : "none"}`,
    `Food: ${draft.preferences.foodInterests.join(", ")}`,
    `Avoids: ${draft.preferences.avoids.join(", ")}`,
    `Weather provider context: ${weatherSummary}`,
    `Destination discovery context:\n${summarizeDiscovery(discovery)}`,
  ].join("\n");
};
