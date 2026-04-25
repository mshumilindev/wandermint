import type { ActivityBlock, MovementLeg } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { SafetyAssessment, SafetyRiskLevel } from "./safety.types";
import { timeToMinutes } from "../trips/pacing/planTimeUtils";

const LATE_EVENING_START_MIN = 21 * 60 + 30; // 21:30
const EARLY_MORNING_END_MIN = 6 * 60 + 30; // 06:30

const VIEWPOINT_OR_REMOTE_OUTDOOR = /\b(viewpoint|lookout|panorama|scenic overlook|observation deck|ridge|summit|trailhead|hiking trail|cliff|vista)\b/i;

const COMMERCIAL_EVENING = /\b(restaurant|cafe|coffee|bar|pub|bistro|brasserie|wine bar|food hall|dinner|supper)\b/i;

const hasLatLng = (block: ActivityBlock): boolean => {
  const lat = block.place?.latitude;
  const lng = block.place?.longitude;
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
};

const locationResolution = (block: ActivityBlock): "resolved" | "estimated" | "missing" => {
  const s = block.normalizedTripPlanItem?.locationResolutionStatus;
  if (s === "resolved" || s === "estimated" || s === "missing") {
    return s;
  }
  return hasLatLng(block) ? "resolved" : "missing";
};

const isOutdoorExposure = (block: ActivityBlock): boolean =>
  block.indoorOutdoor === "outdoor" || (block.indoorOutdoor === "mixed" && block.dependencies.weatherSensitive);

const isCommercialEveningBlock = (block: ActivityBlock): boolean => {
  const hay = `${block.category} ${block.title}`.toLowerCase();
  return COMMERCIAL_EVENING.test(hay);
};

const isViewpointOrRemoteOutdoor = (block: ActivityBlock): boolean => {
  const hay = `${block.title} ${block.category}`.toLowerCase();
  return VIEWPOINT_OR_REMOTE_OUTDOOR.test(hay);
};

const isNightOrPredawnWindow = (startMinutes: number): boolean =>
  startMinutes >= LATE_EVENING_START_MIN || startMinutes < EARLY_MORNING_END_MIN;

const walkingInboundMinutes = (leg: MovementLeg | undefined): number => {
  if (!leg) {
    return 0;
  }
  if (leg.primary.mode !== "walking") {
    return 0;
  }
  return Math.max(0, leg.primary.durationMinutes);
};

const inboundTransitFeelsLimited = (leg: MovementLeg | undefined): boolean => {
  if (!leg) {
    return false;
  }
  const primary = leg.primary;
  const hasTransitAlt = leg.alternatives.some((a) => a.mode === "public_transport");
  if (primary.mode === "public_transport" || primary.mode === "taxi") {
    return false;
  }
  if (primary.mode === "walking") {
    const conf = primary.estimateConfidence ?? "medium";
    if (primary.durationMinutes >= 32) {
      return true;
    }
    if (primary.durationMinutes >= 18 && conf === "low") {
      return true;
    }
    if (!hasTransitAlt && primary.durationMinutes >= 22) {
      return true;
    }
  }
  return false;
};

const mergeRisk = (current: SafetyRiskLevel, next: SafetyRiskLevel): SafetyRiskLevel => {
  const rank: Record<SafetyRiskLevel, number> = { low: 0, unknown: 1, medium: 2, high: 3 };
  return rank[next] > rank[current] ? next : current;
};

/**
 * Structural safety assessment only (time, exposure, location certainty, transport hints).
 * Ignores user acknowledgement — use {@link applySafetyAcknowledgementForDisplay} in UI.
 */
export const assessActivityBlockSafety = (block: ActivityBlock, inboundLeg?: MovementLeg): SafetyAssessment => {
  const reasons: string[] = [];
  let risk: SafetyRiskLevel = "low";

  if (block.type === "meal" || block.type === "rest") {
    return { itemId: block.id, riskLevel: "low", reasons: [] };
  }

  const start = timeToMinutes(block.startTime);
  const loc = locationResolution(block);
  const outdoor = isOutdoorExposure(block);
  const viewpoint = isViewpointOrRemoteOutdoor(block);
  const commercial = isCommercialEveningBlock(block);
  const night = isNightOrPredawnWindow(start);
  const walk = walkingInboundMinutes(inboundLeg);
  const limitedTransit = inboundTransitFeelsLimited(inboundLeg);

  if (loc !== "resolved") {
    risk = mergeRisk(risk, "unknown");
    reasons.push("location_data_incomplete");
  }

  if (night && outdoor && viewpoint) {
    const remote = !hasLatLng(block) || loc !== "resolved" || walk >= 22 || limitedTransit;
    if (remote) {
      risk = mergeRisk(risk, "high");
      reasons.push("late_evening_outdoor_remote");
    } else {
      risk = mergeRisk(risk, "medium");
      reasons.push("late_evening_outdoor_review_timing");
    }
  } else if (night && outdoor && !commercial) {
    risk = mergeRisk(risk, "medium");
    reasons.push("evening_outdoor_review_timing");
  }

  if (commercial && !viewpoint && night && outdoor && risk === "medium" && reasons.length === 1 && reasons[0] === "evening_outdoor_review_timing") {
    return { itemId: block.id, riskLevel: "low", reasons: [] };
  }

  if (night && outdoor && loc === "estimated") {
    risk = mergeRisk(risk, "unknown");
    reasons.push("location_uncertain_evening_outdoor");
  }

  if (risk === "low" && reasons.length === 0) {
    return { itemId: block.id, riskLevel: "low", reasons: [] };
  }

  const unique = [...new Set(reasons)];
  return { itemId: block.id, riskLevel: risk, reasons: unique };
};

/** After explicit user acknowledgement, suppress intrusive UI while keeping raw assessments for audits elsewhere. */
export const applySafetyAcknowledgementForDisplay = (assessment: SafetyAssessment, block: ActivityBlock): SafetyAssessment => {
  if (block.safetyWarningAcknowledged) {
    return { itemId: block.id, riskLevel: "low", reasons: ["user_acknowledged"] };
  }
  return assessment;
};

export const shouldSurfaceSafetyWarning = (assessment: SafetyAssessment): boolean =>
  assessment.riskLevel === "medium" || assessment.riskLevel === "high" || assessment.riskLevel === "unknown";

/**
 * Planner-facing copy (trip generation). No demographic or “this area is safe” claims.
 */
export const buildSafetyPlanningClause = (): string =>
  [
    "Safety-aware planning: do not schedule isolated outdoor viewpoints, remote trails, or cliff-line walks starting late evening (roughly after 21:30) or in pre-dawn darkness unless the user explicitly asked for night photography or similar.",
    "Prefer structured, well-lit evening activities (meals, indoor culture, ticketed venues with clear access) for late slots when the day is otherwise ambiguous.",
    "If location resolution is missing or only estimated, do not assume the stop is in a busy, well-served area — leave slack and avoid implying personal safety outcomes.",
    "Keep warnings conservative and never include demographic, ethnic, or neighborhood stereotype language.",
  ].join(" ");

const legToBlock = (day: DayPlan, blockId: string): MovementLeg | undefined =>
  day.movementLegs?.find((leg) => leg.toBlockId === blockId);

/**
 * Deterministic post-generation notes (same pattern as reservations tradeoffs).
 */
export const collectSafetyPlanningTradeoffs = (day: DayPlan): string[] => {
  const sorted = [...day.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const flagged = sorted.filter((block) => {
    const raw = assessActivityBlockSafety(block, legToBlock(day, block.id));
    return raw.riskLevel === "high" || (raw.riskLevel === "medium" && raw.reasons.includes("late_evening_outdoor_remote"));
  });
  if (flagged.length === 0) {
    return [];
  }
  return [
    `Safety (review): ${flagged.length} late outdoor / remote-style stop(s) on ${day.date} may need timing adjustments — prefer earlier slots or indoor alternatives unless the user insisted on night outdoor plans.`,
  ];
};
