import type { ReliabilityField } from "../data-quality/sourceReliability.types";
import { effectiveFieldScore } from "../data-quality/sourceReliability";
import { normalizeItineraryCategory } from "../../services/planning/itineraryCompositionService";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import type {
  RankedRecommendation,
  RankedRecommendationConfidence,
  RecommendationCandidate,
  RecommendationClusteringContext,
  RecommendationMobility,
  RecommendationRankingInput,
} from "./recommendation.types";

const BASE_SCORE = 500;

const RELIABILITY_FIELDS: ReliabilityField[] = ["title", "location", "openingHours", "price", "image", "eventDate"];

const mobilityTravelSoftCapMinutes = (m: RecommendationMobility | undefined): number => {
  switch (m ?? "medium") {
    case "low":
      return 28;
    case "high":
      return 52;
    default:
      return 38;
  }
};

const parseMustSeeTerms = (ctx: RecommendationClusteringContext | null | undefined): string[] => {
  if (!ctx) {
    return [];
  }
  if (ctx.mustSeeTerms && ctx.mustSeeTerms.length > 0) {
    return ctx.mustSeeTerms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
  }
  if (!ctx.mustSeeNotes?.trim()) {
    return [];
  }
  return ctx.mustSeeNotes
    .split(/[,\n]/g)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length >= 3);
};

const syntheticBlockForCategory = (candidate: RecommendationCandidate) => ({
  type: "activity" as const,
  category: candidate.category ?? candidate.item.type,
  tags: [] as string[],
  title: candidate.item.title,
  description: "",
});

const categoryKeyForCandidate = (candidate: RecommendationCandidate): string =>
  (candidate.category?.trim().toLowerCase() ||
    normalizeItineraryCategory(syntheticBlockForCategory(candidate))) ||
  "other";

const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const inferTripDays = (constraints: RecommendationRankingInput["tripConstraints"]): number => {
  const start = constraints.dateRange.start;
  const end = constraints.dateRange.end;
  const a = Date.parse(`${start}T12:00:00Z`);
  const b = Date.parse(`${end}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) {
    return 3;
  }
  return Math.max(1, Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1);
};

const dailyBudgetGuideline = (constraints: RecommendationRankingInput["tripConstraints"]): number => {
  const { budget } = constraints;
  if (budget.dailySoftLimit && budget.dailySoftLimit > 0) {
    return budget.dailySoftLimit;
  }
  const days = inferTripDays(constraints);
  return Math.max(1, budget.amount / days);
};

const meanReliabilityScore = (map: RecommendationCandidate["reliability"], nowMs: number): number | null => {
  if (!map) {
    return null;
  }
  const scores: number[] = [];
  for (const field of RELIABILITY_FIELDS) {
    const fr = map[field];
    if (fr) {
      scores.push(effectiveFieldScore(fr, field, nowMs));
    }
  }
  if (scores.length === 0) {
    return null;
  }
  return scores.reduce((s, v) => s + v, 0) / scores.length;
};

const mustSeeBoost = (item: RecommendationCandidate["item"], terms: string[]): { boost: number; matched?: string } => {
  if (terms.length === 0) {
    return { boost: 0 };
  }
  const hay = `${item.title}`.trim().toLowerCase();
  for (const term of terms) {
    if (hay.includes(term)) {
      return { boost: 185, matched: term };
    }
  }
  return { boost: 0 };
};

const tasteAffinityBoost = (category: string, taste: RecommendationRankingInput["userTasteProfile"]): number => {
  if (!taste || taste.confidence < 0.08) {
    return 0;
  }
  const key = category.trim().toLowerCase();
  const aff = taste.categoryAffinity[key] ?? 0;
  return Math.round(aff * 130 * taste.confidence);
};

const budgetPenalty = (
  estimate: RecommendationCandidate["budgetEstimate"],
  constraints: RecommendationRankingInput["tripConstraints"],
): { penalty: number; label?: string } => {
  if (!estimate || estimate.estimatedSpendMid <= 0) {
    return { penalty: 0 };
  }
  let currencyMismatch = 0;
  if (estimate.currency.trim().toUpperCase() !== constraints.budget.currency.trim().toUpperCase()) {
    currencyMismatch = 22;
  }
  const daily = dailyBudgetGuideline(constraints);
  const ratio = estimate.estimatedSpendMid / Math.max(1, daily);
  const style = constraints.budget.style;
  const leanThreshold = style === "lean" ? 0.95 : style === "balanced" ? 1.25 : 1.55;
  if (ratio <= leanThreshold) {
    return { penalty: currencyMismatch, label: currencyMismatch ? "Budget currency differs from trip budget" : undefined };
  }
  const over = ratio - leanThreshold;
  const p = Math.min(220, Math.round(40 + over * 140)) + currencyMismatch;
  return {
    penalty: p,
    label: `Spend ~${estimate.estimatedSpendMid} vs ~${Math.round(daily)} daily guide (${style})${currencyMismatch ? "; currency mismatch" : ""}`,
  };
};

const travelPenalty = (item: RecommendationCandidate["item"], cap: number): { penalty: number; label?: string } => {
  const t = item.travelTimeFromPreviousMinutes ?? 0;
  if (t <= cap) {
    return { penalty: 0 };
  }
  const over = t - cap;
  const p = Math.min(200, Math.round(18 + over * 2.8));
  return { penalty: p, label: `Travel from previous stop ${t}m (soft cap ${cap}m)` };
};

const categoryOverloadPenalty = (category: string, ctx: RecommendationClusteringContext | null | undefined): { penalty: number; label?: string } => {
  if (!ctx?.existingCategoryCounts) {
    return { penalty: 0 };
  }
  const key = category.trim().toLowerCase();
  const count = ctx.existingCategoryCounts[key] ?? 0;
  if (count < 2) {
    return { penalty: 0 };
  }
  const p = Math.min(160, (count - 1) * 36);
  return { penalty: p, label: `Category “${key}” already picked ${count} times` };
};

const openingPenalty = (check: RecommendationCandidate["openingHoursCheck"]): { penalty: number; label: string | null } => {
  if (!check) {
    return { penalty: 0, label: null };
  }
  if (check.slotInvalid || check.result.status === "closed") {
    return {
      penalty: 320,
      label: `Closed for planned window (${check.result.reason ?? "opening hours"})`,
    };
  }
  if (check.result.status === "unknown") {
    return { penalty: 55, label: "Opening hours unknown for planned slot" };
  }
  return { penalty: 0, label: null };
};

const reliabilityPenalty = (mean: number | null): { penalty: number; label: string | null } => {
  if (mean === null) {
    return { penalty: 35, label: "No provider reliability metadata" };
  }
  if (mean >= 0.52) {
    return { penalty: 0, label: null };
  }
  if (mean < 0.35) {
    return { penalty: 120, label: `Low data confidence (mean field score ${mean.toFixed(2)})` };
  }
  if (mean < 0.45) {
    return { penalty: 55, label: `Mixed data confidence (mean field score ${mean.toFixed(2)})` };
  }
  return { penalty: 0, label: null };
};

const reliabilityBoost = (mean: number | null): { boost: number; label?: string } => {
  if (mean === null) {
    return { boost: 0 };
  }
  if (mean < 0.72) {
    return { boost: 0 };
  }
  const b = Math.round((mean - 0.72) * 220);
  return { boost: Math.min(95, b), label: `Reliable provider fields (mean ${mean.toFixed(2)})` };
};

const clusteringBoost = (
  item: RecommendationCandidate["item"],
  ctx: RecommendationClusteringContext | null | undefined,
): { boost: number; label?: string } => {
  if (ctx?.referenceLat === undefined || ctx.referenceLng === undefined) {
    return { boost: 0 };
  }
  const d = haversineMeters(item.location.lat, item.location.lng, ctx.referenceLat, ctx.referenceLng);
  if (d > 5200) {
    return { boost: 0 };
  }
  const b = Math.round(95 - d * 0.014);
  return { boost: Math.max(0, b), label: `Near reference point (${Math.round(d)}m)` };
};

const realisticTimingAdjustment = (
  item: RecommendationCandidate["item"],
  behavior: RecommendationRankingInput["behaviorProfile"],
): { boost: number; boostLabel?: string; penalty: number; penaltyLabel?: string } => {
  const start = Date.parse(item.plannedStartTime);
  const end = Date.parse(item.plannedEndTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { boost: 0, penalty: 0 };
  }
  const windowMin = (end - start) / 60000;
  const slack = windowMin - item.estimatedDurationMinutes - (item.travelTimeFromPreviousMinutes ?? 0);
  let boost = 0;
  if (slack >= 18) {
    boost += 42;
  } else if (slack >= 8) {
    boost += 22;
  } else if (slack >= 5) {
    boost += 10;
  }
  let penalty = 0;
  let penaltyLabel: string | undefined;
  if (behavior && behavior.totalTrips > 0 && behavior.averageSkipRate > 0.34 && item.estimatedDurationMinutes < 32 && item.priority !== "must") {
    penalty = 28;
    penaltyLabel = "Tight stop for user with high historical skip rate";
  }
  return {
    boost,
    boostLabel: boost > 0 ? `Schedule slack ${Math.round(slack)}m after duration+travel` : undefined,
    penalty,
    penaltyLabel,
  };
};

const travelConfidencePenalty = (item: RecommendationCandidate["item"]): { penalty: number; label?: string } => {
  if (item.travelEstimateConfidence === "low") {
    return { penalty: 28, label: "Low travel-time estimate confidence" };
  }
  return { penalty: 0 };
};

const rankConfidence = (meanRel: number | null, opening: RecommendationCandidate["openingHoursCheck"], travelConf: TripPlanItem["travelEstimateConfidence"]): RankedRecommendationConfidence => {
  const openOk = !opening || (!opening.slotInvalid && opening.result.status !== "closed");
  const travelOk = travelConf !== "low";
  if (meanRel !== null && meanRel >= 0.68 && openOk && travelOk) {
    return "high";
  }
  if (meanRel === null || meanRel < 0.38 || !openOk) {
    return "low";
  }
  return "medium";
};

const scoreOne = (candidate: RecommendationCandidate, input: RecommendationRankingInput): RankedRecommendation => {
  const { item } = candidate;
  const nowMs = input.nowMs ?? Date.now();
  const reasons: string[] = [];
  const penalties: string[] = [];
  let score = BASE_SCORE;

  const category = categoryKeyForCandidate(candidate);
  const terms = parseMustSeeTerms(input.clustering ?? undefined);
  const must = mustSeeBoost(item, terms);
  if (must.boost > 0) {
    score += must.boost;
    reasons.push(`Must-see match on “${must.matched}” (+${must.boost})`);
  }

  const tasteB = tasteAffinityBoost(category, input.userTasteProfile);
  if (tasteB !== 0) {
    score += tasteB;
    reasons.push(`Taste affinity for “${category}” (${tasteB > 0 ? "+" : ""}${tasteB})`);
  }

  const clusterB = clusteringBoost(item, input.clustering);
  if (clusterB.boost > 0) {
    score += clusterB.boost;
    reasons.push(`${clusterB.label} (+${clusterB.boost})`);
  }

  const meanRel = meanReliabilityScore(candidate.reliability, nowMs);
  const relBoost = reliabilityBoost(meanRel);
  if (relBoost.boost > 0) {
    score += relBoost.boost;
    reasons.push(`${relBoost.label} (+${relBoost.boost})`);
  }

  const timing = realisticTimingAdjustment(item, input.behaviorProfile);
  if (timing.boost > 0 && timing.boostLabel) {
    score += timing.boost;
    reasons.push(`${timing.boostLabel} (+${timing.boost})`);
  }
  if (timing.penalty > 0 && timing.penaltyLabel) {
    score -= timing.penalty;
    penalties.push(`${timing.penaltyLabel} (-${timing.penalty})`);
  }

  const openP = openingPenalty(candidate.openingHoursCheck);
  if (openP.penalty > 0 && openP.label) {
    score -= openP.penalty;
    penalties.push(`${openP.label} (-${openP.penalty})`);
  }

  const relP = reliabilityPenalty(meanRel);
  if (relP.penalty > 0 && relP.label) {
    score -= relP.penalty;
    penalties.push(`${relP.label} (-${relP.penalty})`);
  }

  const cap = mobilityTravelSoftCapMinutes(input.mobilityTolerance);
  const trP = travelPenalty(item, cap);
  if (trP.penalty > 0) {
    score -= trP.penalty;
    penalties.push(`${trP.label} (-${trP.penalty})`);
  }

  const budP = budgetPenalty(candidate.budgetEstimate, input.tripConstraints);
  if (budP.penalty > 0) {
    score -= budP.penalty;
    penalties.push(`Budget mismatch: ${budP.label} (-${budP.penalty})`);
  }

  const catP = categoryOverloadPenalty(category, input.clustering);
  if (catP.penalty > 0) {
    score -= catP.penalty;
    penalties.push(`${catP.label} (-${catP.penalty})`);
  }

  const tConf = travelConfidencePenalty(item);
  if (tConf.penalty > 0) {
    score -= tConf.penalty;
    penalties.push(`${tConf.label} (-${tConf.penalty})`);
  }

  const confidence = rankConfidence(meanRel, candidate.openingHoursCheck, item.travelEstimateConfidence);

  return { item, score, reasons, penalties, confidence };
};

/**
 * Deterministic total ordering: higher score first, then stable `item.id` tie-break.
 * Every point change is reflected in `reasons` / `penalties` for auditability.
 */
export const rankRecommendations = (input: RecommendationRankingInput): RankedRecommendation[] => {
  const ranked = input.candidates.map((c) => scoreOne(c, input));
  return ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.item.id.localeCompare(b.item.id);
  });
};
