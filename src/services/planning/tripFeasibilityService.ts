import dayjs from "dayjs";
import type { ActivityBlock, MovementLeg } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { PlanWarning } from "../../entities/warning/model";
import type { Trip, TripSegment } from "../../entities/trip/model";
import type { TravelBehaviorGenerationPlan } from "../../features/user-behavior/travelBehaviorTripGeneration";
import type { GeneratedTripOptions } from "../ai/schemas";
import type { WeatherContext } from "../providers/contracts";
import { createClientId } from "../../shared/lib/id";
import { nowIso } from "../firebase/timestampMapper";
import { normalizeItineraryCategory } from "./itineraryCompositionService";
import { resolvePlanTimezone } from "../../features/trips/pacing/planTimeUtils";
import { ANALYTICS_EVENTS } from "../../features/observability/analyticsEvents";
import { logAnalyticsEvent } from "../../features/observability/appLogger";
import { openingHoursService } from "./openingHoursService";
import type { TripPlace } from "../places/placeTypes";
import type { TripDraft } from "./tripGenerationService";

interface FeasibilityResult {
  option: GeneratedTripOptions["options"][number];
  warnings: PlanWarning[];
  score: number;
}

const timeToMinutes = (value: string): number | null => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
};

const createWarning = (
  trip: Trip,
  type: PlanWarning["type"],
  severity: PlanWarning["severity"],
  message: string,
  suggestedAction: string,
  affectedBlockIds: string[],
): PlanWarning => ({
  id: createClientId("warning"),
  userId: trip.userId,
  tripId: trip.id,
  severity,
  type,
  message,
  affectedBlockIds,
  suggestedAction,
  createdAt: nowIso(),
});

const isMajorSightBlock = (block: ActivityBlock): boolean => {
  const cat = normalizeItineraryCategory(block);
  if (cat === "museum" || cat === "gallery" || cat === "landmark" || cat === "event") {
    return true;
  }
  return cat === "other" && block.type === "activity";
};

const maxBlocksForProfile = (draft: TripDraft, plan?: TravelBehaviorGenerationPlan | null): number => {
  const paceCap = draft.preferences.pace === "slow" ? 3 : draft.preferences.pace === "balanced" ? 4 : 5;
  const densityBoost =
    draft.executionProfile.scheduleDensity === "relaxed" ? 0
      : draft.executionProfile.scheduleDensity === "balanced" ? 0
        : draft.executionProfile.scheduleDensity === "dense" ? 1
          : 2;

  let cap = paceCap + densityBoost;
  if (plan?.fastPreferred) {
    cap += 1;
  }
  if (plan?.forceRealisticPacing && !plan.userOverridePacked) {
    cap = Math.min(cap, 5);
  }
  if (plan?.slowPreferred) {
    cap = Math.min(cap, 5);
  }
  return cap;
};

const activeMinutesThreshold = (draft: TripDraft, plan?: TravelBehaviorGenerationPlan | null): number => {
  const base = draft.executionProfile.scheduleDensity === "relaxed" ? 360
    : draft.executionProfile.scheduleDensity === "balanced" ? 450
      : draft.executionProfile.scheduleDensity === "dense" ? 540
        : 660;

  const paceAdjustment = draft.preferences.pace === "slow" ? -60 : draft.preferences.pace === "dense" ? 45 : 0;
  let threshold = Math.max(300, base + paceAdjustment);
  if (plan?.fastPreferred) {
    threshold = Math.round(threshold * 1.08);
  }
  return threshold;
};

const matchingForecast = (forecast: WeatherContext[], date: string): WeatherContext | undefined => forecast.find((item) => item.observedAt.slice(0, 10) === date);

const findSegment = (segments: TripSegment[], day: DayPlan): TripSegment | undefined =>
  segments.find((segment) => segment.id === day.segmentId) ??
  segments.find((segment) => day.date >= segment.startDate && day.date <= segment.endDate);

const collectDuplicatePlaceNames = (days: DayPlan[]): string[] => {
  const counts = new Map<string, number>();

  days.forEach((day) => {
    day.blocks.forEach((block) => {
      const name = block.place?.name?.trim().toLowerCase();
      if (!name) {
        return;
      }

      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
};

const dayBlockDuration = (block: ActivityBlock): number => {
  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);
  if (start === null || end === null) {
    return 0;
  }
  return Math.max(0, end - start);
};

const movementDuration = (leg: MovementLeg | undefined): number => leg?.primary.durationMinutes ?? 0;

const buildMustSeeHaystack = (draft: TripDraft): string => {
  const fromPlaces = (draft.mustSeePlaces ?? [])
    .flatMap((p) => [p.label, p.customText, p.candidate?.name].filter(Boolean))
    .join(" ");
  return `${draft.preferences.mustSeeNotes} ${fromPlaces} ${draft.preferences.specialWishes}`.toLowerCase();
};

const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const earthMeters = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthMeters * c;
};

const blockCoversLockedMustSee = (block: ActivityBlock, place: TripPlace): boolean => {
  const hay = `${block.title} ${block.place?.name ?? ""}`.toLowerCase();
  const label = place.label.trim().toLowerCase();
  if (label.length > 0 && hay.includes(label)) {
    return true;
  }
  if (place.mode === "custom") {
    const raw = (place.customText ?? place.label).trim().toLowerCase();
    return raw.length > 2 && hay.includes(raw);
  }
  const c = place.candidate;
  if (!c) {
    return false;
  }
  const name = c.name.trim().toLowerCase();
  if (name.length > 0 && hay.includes(name)) {
    return true;
  }
  const pid = block.place?.providerPlaceId;
  if (pid && c.providerId && pid === c.providerId) {
    return true;
  }
  if (
    c.coordinates &&
    block.place?.latitude !== undefined &&
    block.place?.longitude !== undefined &&
    typeof block.place.latitude === "number" &&
    typeof block.place.longitude === "number"
  ) {
    const meters = haversineMeters(c.coordinates.lat, c.coordinates.lng, block.place.latitude, block.place.longitude);
    if (meters < 120) {
      return true;
    }
    if (meters < 450 && name.length > 0 && hay.includes(name.slice(0, Math.min(16, name.length)))) {
      return true;
    }
  }
  return false;
};

const isMustSeeBlock = (block: ActivityBlock, draft: TripDraft): boolean => {
  const mustSee = buildMustSeeHaystack(draft);
  if (!mustSee.trim()) {
    return false;
  }

  const signature = `${block.title} ${block.place?.name ?? ""} ${block.category}`.toLowerCase();
  return mustSee.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).some((token) => token.length >= 2 && signature.includes(token));
};

export const tripFeasibilityService = {
  validateGeneratedTripOption: (
    option: GeneratedTripOptions["options"][number],
    draft: TripDraft,
    forecast: WeatherContext[],
    generationPlan: TravelBehaviorGenerationPlan | null = null,
  ): FeasibilityResult => {
    const warnings: PlanWarning[] = [];
    const duplicatePlaces = collectDuplicatePlaceNames(option.days);
    const blocksLimit = maxBlocksForProfile(draft, generationPlan);
    const activityThreshold = activeMinutesThreshold(draft, generationPlan);

    const nextDays = option.days.map((day) => {
      const dayWarnings: PlanWarning[] = [];
      const segment = findSegment(option.trip.tripSegments, day);

      if (!segment || day.date < segment.startDate || day.date > segment.endDate) {
        dayWarnings.push(
          createWarning(
            option.trip,
            "route_issue",
            "warning",
            `${day.cityLabel} sits outside its expected city segment dates.`,
            "Shift this day back inside the correct city window before saving the trip.",
            day.blocks.map((block) => block.id),
          ),
        );
      }

      if (day.blocks.length > blocksLimit) {
        dayWarnings.push(
          createWarning(
            option.trip,
            "route_issue",
            draft.executionProfile.scheduleDensity === "extreme" ? "info" : "warning",
            `${day.cityLabel} carries ${day.blocks.length} stops, which is dense for this travel pace.`,
            "Trim one or two lighter stops if you want the day to breathe more comfortably.",
            day.blocks.map((block) => block.id),
          ),
        );
      }

      if (generationPlan?.slowPreferred) {
        const majorStops = day.blocks.filter(isMajorSightBlock);
        if (majorStops.length > 4) {
          dayWarnings.push(
            createWarning(
              option.trip,
              "route_issue",
              "warning",
              `${day.cityLabel} lists more than four major sights or deep activities, which may be heavy for your usual pace.`,
              "Consider dropping or shortening one museum, gallery, or landmark so meals and rest still feel relaxed.",
              majorStops.map((block) => block.id),
            ),
          );
        }
      }

      let activeMinutes = 0;
      let unknownOpeningBlockCount = 0;
      day.blocks.forEach((block, index) => {
        activeMinutes += dayBlockDuration(block);
        activeMinutes += movementDuration(day.movementLegs?.[index]);

        const currentStart = timeToMinutes(block.startTime);
        const currentEnd = timeToMinutes(block.endTime);
        if (currentStart === null || currentEnd === null) {
          return;
        }

        if (currentEnd < currentStart) {
          dayWarnings.push(
            createWarning(
              option.trip,
              "route_issue",
              "critical",
              `${block.title} has timing that runs backwards.`,
              "Fix the timing before trusting this day.",
              [block.id],
            ),
          );
        }

        const nextBlock = day.blocks[index + 1];
        if (!nextBlock) {
          return;
        }

        const nextStart = timeToMinutes(nextBlock.startTime);
        if (nextStart === null) {
          return;
        }

        if (nextStart < currentEnd) {
          dayWarnings.push(
            createWarning(
              option.trip,
              "route_issue",
              "critical",
              `${block.title} overlaps with the next stop in ${day.cityLabel}.`,
              "Separate the time windows so the route can actually be followed.",
              [block.id, nextBlock.id],
            ),
          );
        }

        const requiredTravelMinutes = movementDuration(day.movementLegs?.[index]);
        const gapMinutes = Math.max(0, nextStart - currentEnd);
        if (requiredTravelMinutes > 0 && gapMinutes < requiredTravelMinutes) {
          const severity: PlanWarning["severity"] = isMustSeeBlock(block, draft) || isMustSeeBlock(nextBlock, draft) ? "warning" : "critical";
          dayWarnings.push(
            createWarning(
              option.trip,
              "route_issue",
              severity,
              `${block.title} to ${nextBlock.title} runs tighter than the current transfer allows.`,
              isMustSeeBlock(block, draft) || isMustSeeBlock(nextBlock, draft)
                ? "Keep the must-see stop, but give this transfer more breathing room."
                : "Reorder or shorten the day so the transfer becomes realistic.",
              [block.id, nextBlock.id],
            ),
          );
        }

        const openingFit = openingHoursService.getOpeningHoursFit(
          block.place?.openingHoursLabel,
          day.date,
          block.startTime,
          block.endTime,
          resolvePlanTimezone(option.trip, day.segmentId),
        );
        if (openingFit === "closed") {
          dayWarnings.push(
            createWarning(
              option.trip,
              "opening_hours_change",
              isMustSeeBlock(block, draft) ? "warning" : "critical",
              `${block.title} looks closed in that time window.`,
              isMustSeeBlock(block, draft)
                ? "Keep it on the plan if it matters, but move it into an opening window."
                : "Swap this stop or move it to a time when it is open.",
              [block.id],
            ),
          );
        } else if (openingFit === "unknown") {
          unknownOpeningBlockCount += 1;
          dayWarnings.push(
            createWarning(
              option.trip,
              "opening_hours_change",
              "info",
              `${block.title} may need a timing check before you rely on this stop.`,
              "Double-check the timing before the trip if this stop matters.",
              [block.id],
            ),
          );
        }
      });

      if (unknownOpeningBlockCount > 0) {
        logAnalyticsEvent(ANALYTICS_EVENTS.opening_hours_unknown, {
          tripId: option.trip.id,
          dayId: day.id,
          date: day.date,
          unknownBlockCount: unknownOpeningBlockCount,
        });
      }

      const dayForecast = matchingForecast(forecast, day.date);
      const outdoorBlocks = day.blocks.filter((block) => block.indoorOutdoor === "outdoor" || (block.indoorOutdoor === "mixed" && block.dependencies.weatherSensitive));
      if (dayForecast && dayForecast.precipitationChance >= 55 && outdoorBlocks.length >= Math.max(2, Math.ceil(day.blocks.length / 2))) {
        dayWarnings.push(
          createWarning(
            option.trip,
            "weather_change",
            "warning",
            `${day.cityLabel} leans outdoor while the forecast looks unsettled.`,
            "Keep the shape of the day, but line up one or two indoor swaps just in case.",
            outdoorBlocks.map((block) => block.id),
          ),
        );
      }

      if (activeMinutes > activityThreshold && draft.executionProfile.scheduleDensity !== "extreme") {
        dayWarnings.push(
          createWarning(
            option.trip,
            "route_issue",
            "warning",
            `${day.cityLabel} packs about ${activeMinutes} active minutes into one day.`,
            "Compress a lighter stop if you want this day to feel less brittle.",
            day.blocks.map((block) => block.id),
          ),
        );
      }

      if (draft.budget.dailySoftLimit !== undefined && day.estimatedCostRange.max > draft.budget.dailySoftLimit) {
        dayWarnings.push(
          createWarning(
            option.trip,
            "price_change",
            "warning",
            `${day.cityLabel} pushes past the daily comfort budget.`,
            "Swap one pricier stop or tighten meals and transport on this day.",
            day.blocks.map((block) => block.id),
          ),
        );
      }

      day.blocks.forEach((block) => {
        const duplicated = block.place?.name ? duplicatePlaces.includes(block.place.name.trim().toLowerCase()) : false;
        if (duplicated) {
          dayWarnings.push(
            createWarning(
              option.trip,
              "availability_change",
              "info",
              `${block.title} repeats a place already used elsewhere in this trip.`,
              "Keep it if it is intentional, or swap it for a fresher local alternative.",
              [block.id],
            ),
          );
        }
      });

      warnings.push(...dayWarnings);

      const validationStatus: DayPlan["validationStatus"] = dayWarnings.some((warning) => warning.severity === "critical")
        ? "needs_review"
        : dayWarnings.length > 0
          ? "partial"
          : "fresh";

      return {
        ...day,
        warnings: dayWarnings,
        validationStatus,
      };
    });

    for (const place of draft.mustSeePlaces ?? []) {
      const covered = option.days.some((day) => day.blocks.some((block) => blockCoversLockedMustSee(block, place)));
      if (!covered) {
        warnings.push(
          createWarning(
            option.trip,
            "route_issue",
            "warning",
            `Locked must-see "${place.label}" is not represented as a stop on this plan.`,
            "Regenerate or widen the city dates — the model should not silently ignore a locked must-see.",
            [],
          ),
        );
      }
    }

    const score = warnings.reduce((current, warning) => current - (
      warning.severity === "critical" ? 18 : warning.severity === "warning" ? 9 : 3
    ), 100);

    const warningTradeoffs = warnings.slice(0, 4).map((warning) => warning.message);

    return {
      option: {
        ...option,
        days: nextDays,
        tradeoffs: [...option.tradeoffs, ...warningTradeoffs].filter((item, index, values) => values.indexOf(item) === index),
      },
      warnings,
      score,
    };
  },
};
