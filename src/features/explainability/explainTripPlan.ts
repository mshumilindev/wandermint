import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { PlanWarning } from "../../entities/warning/model";
import type { GeneratedTripOptions } from "../../services/ai/schemas";
import type { TripDraft } from "../../services/planning/tripGenerationService";
import { normalizeItineraryCategory } from "../../services/planning/itineraryCompositionService";
import { openingHoursService } from "../../services/planning/openingHoursService";
import { resolvePlanTimezone } from "../trips/pacing/planTimeUtils";
import { timelineValidationForDayPlan } from "../trip-planning/timeline/timelineValidator";
import type { PlanExplanation } from "./planExplanation.types";

export type ExplainTripPlanContext = {
  option: GeneratedTripOptions["options"][number];
  draft: TripDraft;
  feasibilityWarnings: PlanWarning[];
};

const uniq = (lines: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const s = raw.trim();
    if (!s || seen.has(s)) {
      continue;
    }
    seen.add(s);
    out.push(s);
  }
  return out;
};

const flatBlocks = (days: DayPlan[]): ActivityBlock[] => days.flatMap((d) => d.blocks);

const mustSeeHaystackForExplain = (draft: TripDraft): string => {
  const fromPlaces = (draft.mustSeePlaces ?? [])
    .flatMap((p) => [p.label, p.customText, p.candidate?.name].filter(Boolean))
    .join(" ");
  return `${draft.preferences.mustSeeNotes} ${fromPlaces} ${draft.preferences.specialWishes}`.toLowerCase();
};

const mustSeeHit = (block: ActivityBlock, draft: TripDraft): boolean => {
  const mustSee = mustSeeHaystackForExplain(draft);
  if (!mustSee.trim()) {
    return false;
  }
  const signature = `${block.title} ${block.place?.name ?? ""} ${block.category}`.toLowerCase();
  return mustSee
    .split(/[,;\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .some((token) => token.length >= 3 && signature.includes(token));
};

const foodInterestHits = (block: ActivityBlock, draft: TripDraft): string[] => {
  const cat = normalizeItineraryCategory(block);
  const foodLike = cat === "food" || cat === "cafe" || cat === "drink" || block.type === "meal";
  if (!foodLike) {
    return [];
  }
  const hay = `${block.title} ${block.description} ${block.tags.join(" ")}`.toLowerCase();
  return draft.preferences.foodInterests.filter((t) => {
    const x = t.trim().toLowerCase();
    return x.length >= 3 && hay.includes(x);
  });
};

export const explainTripPlan = (ctx: ExplainTripPlanContext): PlanExplanation => {
  const { option, draft, feasibilityWarnings } = ctx;
  const blocks = flatBlocks(option.days);
  const cities = uniq(option.days.map((d) => d.cityLabel.trim()).filter(Boolean));
  const trip = option.trip;

  const includedBecause: string[] = [];
  for (const block of blocks) {
    if (block.place?.planningSource === "bucket_list") {
      includedBecause.push(`"${block.title}" is carried from your bucket list (saved for later travel).`);
    }
    if (block.locked) {
      includedBecause.push(`"${block.title}" is locked in the plan (${normalizeItineraryCategory(block)}) — it was kept as a hard commitment.`);
    }
    if (mustSeeHit(block, draft)) {
      includedBecause.push(`"${block.title}" lines up with text you listed under must-sees or special wishes.`);
    }
    const foodHits = foodInterestHits(block, draft);
    for (const tag of foodHits) {
      includedBecause.push(`"${block.title}" reflects your food interest “${tag}”.`);
    }
  }
  if (draft.anchorEvents.length > 0) {
    for (const ev of draft.anchorEvents) {
      includedBecause.push(`Route includes anchor event “${ev.title}” in ${ev.city} (${ev.startAt.slice(0, 10)}).`);
    }
  }
  if (draft.memoryLayers?.temporaryTripPreferences) {
    const v = draft.memoryLayers.temporaryTripPreferences.preferences.vibe;
    if (v.length > 0) {
      includedBecause.push(`Day mix is steered by wizard vibe tags: ${v.slice(0, 6).join(", ")}${v.length > 6 ? "…" : ""}.`);
    }
  }

  const excludedBecause: string[] = [];
  const bucketConsidered = draft.bucketListConsideredForPlanning ?? [];
  const bucketHit = (item: (typeof bucketConsidered)[number]): boolean =>
    blocks.some(
      (b) =>
        b.place?.bucketListItemId === item.id ||
        (item.entityId && b.place?.providerPlaceId === item.entityId) ||
        b.title.trim().toLowerCase() === item.title.trim().toLowerCase(),
    );
  for (const item of bucketConsidered) {
    if (bucketHit(item)) {
      continue;
    }
    const ic = item.location?.country?.trim().toLowerCase();
    const distanceReason =
      ic &&
      !draft.tripSegments.some((s) => {
        const sc = s.country.trim().toLowerCase();
        return sc === ic || sc.includes(ic) || ic.includes(sc);
      });
    excludedBecause.push(
      distanceReason
        ? `Not included due to distance: "${item.title}"`
        : `Not included due to time constraints: "${item.title}"`,
    );
  }

  const hayAll = blocks.map((b) => `${b.title} ${b.tags.join(" ")} ${b.category}`.toLowerCase()).join(" | ");
  for (const avoid of draft.preferences.avoids) {
    const a = avoid.trim().toLowerCase();
    if (a.length < 3) {
      continue;
    }
    if (!hayAll.includes(a)) {
      excludedBecause.push(`Nothing in this option’s stop titles/tags clearly matches your avoid “${avoid.trim()}”.`);
    }
  }
  const majorCats = new Set(blocks.map((b) => normalizeItineraryCategory(b)));
  if (draft.preferences.pace === "slow" && majorCats.has("museum") && blocks.filter((b) => normalizeItineraryCategory(b) === "museum").length >= 4) {
    excludedBecause.push(`Despite a slow pace preference, this option still schedules several museum-class stops — density stayed high to fit anchors and must-sees.`);
  }

  const assumptions: string[] = [];
  assumptions.push(
    `Costs for stops use ${draft.budget.style} heuristics in ${draft.budget.currency}; totals are estimates until you confirm venues.`,
  );
  const segmentTz = option.days[0] ? resolvePlanTimezone(trip, option.days[0].segmentId) : "UTC";
  assumptions.push(`Movement legs assume walking/transit mixes consistent with segment timezone ${segmentTz} for opening-hour checks.`);
  if (draft.travelBehaviorGenerationPlan?.forceRealisticPacing) {
    assumptions.push("Pacing was nudged toward fewer packed hours because your past trips showed high skip rates (unless you overrode density).");
  }
  if (draft.memoryLayers?.globalUserPreferences?.travelPacePreference) {
    assumptions.push(`Account pace preference is ${draft.memoryLayers.globalUserPreferences.travelPacePreference} (wizard day pace may differ for this trip only).`);
  }

  const risks: string[] = [];
  for (const w of feasibilityWarnings) {
    risks.push(`${w.type} (${w.severity}) on ${trip.title}: ${w.message}`);
  }
  for (const line of option.tradeoffs) {
    const lower = line.toLowerCase();
    if (
      lower.includes("timeline") ||
      lower.includes("budget") ||
      lower.includes("overload") ||
      lower.includes("repair") ||
      lower.includes("tight") ||
      lower.includes("reservation") ||
      lower.includes("safety")
    ) {
      risks.push(line);
    }
  }
  for (const day of option.days) {
    const tv = timelineValidationForDayPlan(day);
    for (const w of tv.warnings) {
      if (w.severity === "high" || w.type === "cluster_long_jump" || w.type === "cluster_efficiency") {
        risks.push(`${day.cityLabel} ${day.date} — ${w.type}: ${w.message}`);
      }
    }
  }

  const lowConfidenceFields: string[] = [];
  for (const day of option.days) {
    const tz = resolvePlanTimezone(trip, day.segmentId);
    for (const block of day.blocks) {
      const place = block.place;
      if (typeof place?.latitude !== "number" || !Number.isFinite(place.latitude) || typeof place?.longitude !== "number" || !Number.isFinite(place.longitude)) {
        lowConfidenceFields.push(`"${block.title}" (${day.date}) has no coordinates on the place snapshot — distances are approximate.`);
      }
      const fit = openingHoursService.getOpeningHoursFit(place?.openingHoursLabel, day.date, block.startTime, block.endTime, tz);
      if (fit === "unknown") {
        lowConfidenceFields.push(`"${block.title}" (${day.date}): opening hours are unknown for that wall-time window.`);
      }
      if (block.estimatedCost.certainty === "unknown") {
        lowConfidenceFields.push(`"${block.title}" (${day.date}): cost marked certainty "unknown".`);
      }
      const leg = day.movementLegs?.find((l) => l.toBlockId === block.id);
      if (leg?.primary.estimateConfidence === "low") {
        lowConfidenceFields.push(`Travel into "${block.title}" (${day.date}): leg marked low confidence (${Math.round(leg.primary.durationMinutes)}m).`);
      }
    }
  }

  const stopCount = blocks.filter((b) => b.type !== "transfer" && b.type !== "rest").length;
  const summary = `${option.label}: ${stopCount} primary stops across ${option.days.length} day(s) in ${cities.join(" → ") || trip.destination}; envelope ${trip.budget.amount} ${trip.budget.currency} (${trip.budget.style}). ${option.positioning.trim()}`;

  return {
    summary: summary.trim(),
    assumptions: uniq(assumptions),
    includedBecause: uniq(includedBecause).slice(0, 14),
    excludedBecause: uniq(excludedBecause).slice(0, 16),
    risks: uniq(risks).slice(0, 16),
    lowConfidenceFields: uniq(lowConfidenceFields).slice(0, 18),
  };
};
