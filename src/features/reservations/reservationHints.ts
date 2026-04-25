import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { DestinationDiscovery } from "../../services/providers/contracts";
import type { ReservationConfidence, ReservationRequirement, ReservationRequirementLevel } from "./reservation.types";

export const RESERVATION_HEURISTIC_SOURCE = "heuristic:v1";

type PatternRule = {
  pattern: RegExp;
  requirement: ReservationRequirementLevel;
  confidence: ReservationConfidence;
};

/** Major ticketed / timed-entry sites (substring match on title + place name). */
const WORLD_CLASS_TICKETED: PatternRule[] = [
  { pattern: /\b(louvre|musée du louvre)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(vatican museums?|sistine chapel)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(colosseum|coliseum)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(alhambra)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(acropolis)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(anne frank house|rijksmuseum|van gogh museum)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(uffizi)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(machu picchu|petra|taj mahal)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(sagrada familia)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(statue of liberty|ellis island)\b/i, requirement: "time_slot_required", confidence: "high" },
  { pattern: /\b(burj khalifa|empire state building|eiffel tower)\b/i, requirement: "time_slot_required", confidence: "medium" },
  { pattern: /\b(skytree|tokyo skytree|shard viewing|one world observatory|edge nyc)\b/i, requirement: "time_slot_required", confidence: "medium" },
];

const MUSEUM_LIKE = /\b(museum|gallery|palace museum|national gallery|pinacoteca)\b/i;

const combineHaystack = (block: ActivityBlock): string => {
  const placeName = block.place?.name?.trim() ?? "";
  return `${block.title} ${placeName}`.trim();
};

const matchRules = (haystack: string, rules: PatternRule[]): PatternRule | null => {
  const h = haystack.toLowerCase();
  for (const rule of rules) {
    if (rule.pattern.test(h)) {
      return rule;
    }
  }
  return null;
};

/**
 * Infer reservation expectations from block text/category only.
 * Never sets `bookingUrl` (no hallucinated ticket links).
 */
export const getReservationRequirementForBlock = (block: ActivityBlock): ReservationRequirement => {
  const hay = combineHaystack(block);
  const hit = matchRules(hay, WORLD_CLASS_TICKETED);
  if (hit) {
    return {
      itemId: block.id,
      requirement: hit.requirement,
      source: RESERVATION_HEURISTIC_SOURCE,
      confidence: hit.confidence,
    };
  }

  const cat = block.category?.toLowerCase() ?? "";
  const type = block.type?.toLowerCase() ?? "";
  const desc = `${block.description ?? ""}`.toLowerCase();

  if (cat === "museum" || cat === "gallery" || MUSEUM_LIKE.test(hay)) {
    if (/\b(timed entry|time-slot|time slot|tickets required|advance ticket|prebook|pre-book)\b/i.test(desc)) {
      return {
        itemId: block.id,
        requirement: "recommended",
        source: RESERVATION_HEURISTIC_SOURCE,
        confidence: "medium",
      };
    }
    return {
      itemId: block.id,
      requirement: "unknown",
      source: RESERVATION_HEURISTIC_SOURCE,
      confidence: "low",
    };
  }

  if (cat === "attraction" || type === "activity") {
    if (/\b(tour|ticket|entry|admission|skip.?the.?line)\b/i.test(desc)) {
      return {
        itemId: block.id,
        requirement: "recommended",
        source: RESERVATION_HEURISTIC_SOURCE,
        confidence: "medium",
      };
    }
  }

  return {
    itemId: block.id,
    requirement: "none",
    source: RESERVATION_HEURISTIC_SOURCE,
    confidence: "high",
  };
};

/** User-facing line when `requirement === "unknown"` (Rule 3). */
export const RESERVATION_CHECK_BEFORE_GOING = "Check ticket rules and official opening times before you go.";

export const getReservationGuidanceLine = (req: ReservationRequirement): string | null => {
  if (req.requirement === "none") {
    return null;
  }
  if (req.requirement === "unknown") {
    return RESERVATION_CHECK_BEFORE_GOING;
  }
  if (req.requirement === "recommended") {
    return "Advance tickets or reservations are often a good idea for this kind of stop.";
  }
  if (req.requirement === "required") {
    return "This visit typically needs a ticket or reservation — confirm before you travel.";
  }
  if (req.requirement === "time_slot_required") {
    return "This stop usually needs a reserved time slot — book through an official channel before relying on this plan.";
  }
  return null;
};

/**
 * Static planner instructions (trip generation). Never claims specific booking URLs.
 */
export const buildTripGenerationReservationClause = (): string =>
  [
    "Reservation discipline: many major museums, palaces, viewpoint decks, and blockbuster landmarks require timed tickets or sell out.",
    "Do not assume same-day walk-up entry for multiple world-class ticketed venues on one calendar day unless the plan explicitly leaves long open buffers and an alternate self-guided block.",
    "If the day stacks two or more stops that normally need advance tickets, separate them across days or insert a long flexible buffer plus an explicit note in tradeoffs that tickets must be confirmed.",
    "Never invent ticket purchase URLs in JSON or prose — only reference ticketing if the user or provider snapshot already supplied a link.",
    "When unsure, prefer conservative pacing and label uncertainty rather than implying guaranteed entry.",
  ].join(" ");

const discoveryTitleHaystack = (discovery: DestinationDiscovery): string[] => {
  const buckets: Array<{ title: string }[]> = [
    discovery.attractions,
    discovery.museums,
    discovery.nearbyPlaces,
    discovery.dayTrips,
    discovery.mustSee,
  ];
  return buckets.flatMap((b) => b.map((x) => x.title)).filter((t) => t.trim().length > 0);
};

/** Short list of discovery titles that look reservation-heavy (for prompt grounding only). */
export const buildReservationHeavyDiscoverySummary = (discovery: DestinationDiscovery): string => {
  const titles = discoveryTitleHaystack(discovery);
  const flagged = titles.filter((t) => matchRules(t, WORLD_CLASS_TICKETED) !== null);
  const unique = [...new Set(flagged.map((t) => t.trim()))];
  if (unique.length === 0) {
    return "";
  }
  return `Grounding items that often need advance tickets or timed slots (verify externally): ${unique.slice(0, 10).join("; ")}.`;
};

const isHeavyReservation = (req: ReservationRequirement): boolean =>
  req.requirement === "required" || req.requirement === "time_slot_required";

/**
 * Deterministic hints for post-generation review / regeneration (Rule 4).
 */
export const collectReservationSameDayRoutingHints = (day: DayPlan): string[] => {
  const reqs = day.blocks.map((b) => getReservationRequirementForBlock(b));
  const heavy = day.blocks.filter((_, i) => isHeavyReservation(reqs[i]!));
  if (heavy.length < 2) {
    return [];
  }
  return [
    `Same day (${day.date}) includes ${heavy.length} stops that typically need advance tickets or timed entry — avoid implying walk-up access for all of them; add buffers or move one to another day.`,
  ];
};

export const shouldSurfaceReservationBeforeVisit = (req: ReservationRequirement): boolean =>
  req.requirement !== "none";
