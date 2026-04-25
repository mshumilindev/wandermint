import dayjs from "dayjs";
import type { TripPlanningMode } from "../../entities/trip/model";

export type TripOptionCountPlan = {
  min: number;
  target: number;
  max: number;
  reason: string;
};

export type TripOptionCountInput = {
  durationDays: number;
  segmentCount: number;
  planningMode: TripPlanningMode;
  /** 0–1 rough score: taste + music + bucket + behavior signals (optional). */
  personalizationRichness?: number;
  /** When true, prefer fewer options until the user tightens inputs. */
  missingCriticalDetails?: boolean;
  /** Explicit UI request; clamped to [1, 5] when set. */
  userRequestedOptionCount?: number;
};

const clampInt = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n)));

/**
 * Chooses min/target/max option counts for trip generation — deterministic, no LLM.
 */
export const resolveTripOptionCount = (input: TripOptionCountInput): TripOptionCountPlan => {
  const explicit = input.userRequestedOptionCount;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    const t = clampInt(explicit, 1, 5);
    return {
      min: Math.max(1, t - 1),
      target: t,
      max: Math.min(5, t + 1),
      reason: "User-selected option count (clamped to safe bounds).",
    };
  }

  const days = Math.max(1, input.durationDays);
  const segments = Math.max(1, input.segmentCount);
  const eventLed = input.planningMode === "event_led";
  const uncertain = Boolean(input.missingCriticalDetails);
  const richness = typeof input.personalizationRichness === "number" ? input.personalizationRichness : 0.45;

  if (uncertain) {
    return { min: 1, target: 2, max: 3, reason: "Missing key trip details — fewer variants with stronger guardrails." };
  }

  if (days <= 1) {
    return { min: 1, target: 2, max: 3, reason: "Same-day / single-day trips support a tight pair of variants plus an optional stretch." };
  }

  if (days <= 3 && segments <= 1 && !eventLed) {
    return { min: 2, target: 3, max: 4, reason: "Short single-city trips: three balanced archetypes with room for a fourth stretch variant." };
  }

  if (eventLed) {
    return {
      min: 2,
      target: segments >= 3 ? 3 : 2,
      max: 3,
      reason: "Event-led plans are constraint-heavy — fewer genuinely different schedules.",
    };
  }

  if (days >= 8 || segments >= 3) {
    const target = richness > 0.55 ? 5 : 4;
    return {
      min: 3,
      target,
      max: 5,
      reason: "Long or multi-city itineraries benefit from an extra pacing/budget archetype when personalization signals are rich.",
    };
  }

  // Default 4–7 day window
  return {
    min: 2,
    target: days >= 5 ? 4 : 3,
    max: 5,
    reason: "Mid-length trips: three to four differentiated plans without flooding low-signal variants.",
  };
};

export const tripDurationDaysFromRange = (start: string, end: string): number => {
  const a = dayjs(start);
  const b = dayjs(end);
  if (!a.isValid() || !b.isValid() || b.isBefore(a, "day")) {
    return 1;
  }
  return b.diff(a, "day") + 1;
};

export type TripOptionDraftSlice = {
  planningMode: TripPlanningMode;
  dateRange: { start: string; end: string };
  tripSegments: Array<{ city?: string; country?: string }>;
  anchorEvents: unknown[];
};

export const resolveTripOptionCountFromDraft = (
  draft: TripOptionDraftSlice,
  opts?: { missingCriticalDetails?: boolean; personalizationRichness?: number },
): TripOptionCountPlan => {
  const days = tripDurationDaysFromRange(draft.dateRange.start, draft.dateRange.end);
  const segmentCount = Math.max(1, draft.tripSegments.length);
  return resolveTripOptionCount({
    durationDays: days,
    segmentCount,
    planningMode: draft.planningMode,
    personalizationRichness: opts?.personalizationRichness,
    missingCriticalDetails: opts?.missingCriticalDetails,
  });
};
