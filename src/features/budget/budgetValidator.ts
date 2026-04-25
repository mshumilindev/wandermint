import type { ActivityBlock, MovementLeg } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { TripBudget } from "../../entities/trip/model";
import { pricingService } from "../../services/pricing/pricingService";
import type { BudgetSuspiciousItem, BudgetValidationResult } from "./budget.types";
import { costRangeToBudgetEstimate, estimateBlockBudget, sumEstimatesInCurrency } from "./budgetEstimator";

const mealHaystack = (block: ActivityBlock): boolean => {
  const hay = `${block.type} ${block.category} ${block.title}`.toLowerCase();
  return (
    block.type === "meal" ||
    hay.includes("restaurant") ||
    hay.includes("dinner") ||
    hay.includes("lunch") ||
    hay.includes("brunch") ||
    hay.includes("food") ||
    hay.includes("bistro") ||
    hay.includes("trattoria")
  );
};

const attractionHaystack = (block: ActivityBlock): boolean => {
  const hay = `${block.type} ${block.category} ${block.title}`.toLowerCase();
  return (
    hay.includes("museum") ||
    hay.includes("gallery") ||
    hay.includes("landmark") ||
    hay.includes("sight") ||
    hay.includes("ticket") ||
    hay.includes("tour") ||
    hay.includes("castle") ||
    hay.includes("exhibit")
  );
};

const midpoint = (min: number, max: number): number => (min + max) / 2;

const validateBlockAgainstReference = (
  block: ActivityBlock,
  day: DayPlan,
  budgetStyle: TripBudget["style"],
): { suspicious: BudgetSuspiciousItem[]; warnings: string[] } => {
  const suspicious: BudgetSuspiciousItem[] = [];
  const warnings: string[] = [];
  const cost = block.estimatedCost;
  if (!cost || !Number.isFinite(cost.min) || !Number.isFinite(cost.max)) {
    warnings.push(`Block "${block.title}" is missing a usable cost range.`);
    return { suspicious, warnings };
  }

  const reference = pricingService.estimateActivityCost({
    type: block.type,
    category: block.category,
    place: block.place,
    city: day.cityLabel,
    country: day.countryLabel,
    locationLabel: `${day.cityLabel}${day.countryLabel ? `, ${day.countryLabel}` : ""}`,
    budgetStyle,
  });

  const refMin = reference.min;
  const refMax = Math.max(reference.max, reference.min + 1e-6);
  const cMin = cost.min;
  const cMax = Math.max(cost.max, cost.min + 1e-6);

  if (mealHaystack(block)) {
    const low = refMin * 0.35;
    const high = refMax * 2.6;
    if (midpoint(cMin, cMax) < low) {
      suspicious.push({ itemId: block.id, reason: "Restaurant-style stop looks unusually cheap for this city band." });
    }
    if (midpoint(cMin, cMax) > high) {
      suspicious.push({ itemId: block.id, reason: "Restaurant-style stop looks unusually expensive for this city band." });
    }
  }

  if (attractionHaystack(block) && !mealHaystack(block)) {
    if (cMax > refMax * 2.4) {
      suspicious.push({ itemId: block.id, reason: "Attraction-style pricing sits far above the typical category band." });
    }
    if (refMin > 8 && cMin < refMin * 0.35) {
      suspicious.push({ itemId: block.id, reason: "Attraction-style pricing looks unrealistically low versus the reference band." });
    }
  }

  if (cost.min === cost.max && cost.max > 0 && cost.certainty === "exact") {
    warnings.push(`"${block.title}" uses a single exact price — treat as indicative.`);
  }

  return { suspicious, warnings };
};

const validateMovementLeg = (
  leg: MovementLeg,
  budgetStyle: TripBudget["style"],
  city: string,
  country: string | undefined,
): { suspicious: BudgetSuspiciousItem[]; warnings: string[] } => {
  const suspicious: BudgetSuspiciousItem[] = [];
  const warnings: string[] = [];
  const primary = leg.primary;
  const cost = primary.estimatedCost;
  const distanceKm = (leg.distanceMeters ?? 0) / 1000;
  if (!cost || primary.mode === "walking") {
    return { suspicious, warnings };
  }

  const ref = pricingService.estimateMovementCost({
    mode: primary.mode,
    distanceKm,
    durationMinutes: primary.durationMinutes,
    city,
    country,
    locationLabel: `${city}${country ? `, ${country}` : ""}`,
    budgetStyle,
  });
  if (!ref) {
    return { suspicious, warnings };
  }

  const refMax = Math.max(ref.max, ref.min + 0.01);
  const cMax = Math.max(cost.max, cost.min + 0.01);
  if (cMax > refMax * 2.8 || cost.min < ref.min * 0.35) {
    suspicious.push({
      itemId: leg.id,
      reason: `Movement (${primary.mode}) cost looks inconsistent with ~${distanceKm.toFixed(1)} km in this city.`,
    });
  }

  return { suspicious, warnings };
};

export const validateDayPlanBudget = (day: DayPlan, tripBudget: TripBudget): BudgetValidationResult => {
  const suspiciousItems: BudgetSuspiciousItem[] = [];
  const warnings: string[] = [];
  let shouldLabelEstimated = false;

  for (const block of day.blocks) {
    const { suspicious, warnings: w } = validateBlockAgainstReference(block, day, tripBudget.style);
    suspiciousItems.push(...suspicious);
    warnings.push(...w);
    const est = estimateBlockBudget(block, day, tripBudget.style);
    if (est.confidence === "low") {
      shouldLabelEstimated = true;
    }
    if (block.estimatedCost.certainty === "estimated" || block.estimatedCost.certainty === "unknown") {
      shouldLabelEstimated = true;
    }
  }

  const sorted = [...day.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (!from || !to) {
      continue;
    }
    const leg = day.movementLegs?.find((l) => l.fromBlockId === from.id && l.toBlockId === to.id);
    if (!leg) {
      continue;
    }
    const { suspicious, warnings: w } = validateMovementLeg(leg, tripBudget.style, day.cityLabel, day.countryLabel);
    suspiciousItems.push(...suspicious);
    warnings.push(...w);
  }

  const estimates = day.blocks.map((b) => costRangeToBudgetEstimate(b.estimatedCost, "plan_block"));
  const { min: totalMin, max: totalMax } = sumEstimatesInCurrency(estimates, tripBudget.currency);

  const soft = tripBudget.dailySoftLimit ?? tripBudget.amount / Math.max(1, Math.round((day.blocks.length || 6) / 3));
  if (Number.isFinite(soft) && soft > 0 && totalMax > soft * 1.35) {
    warnings.push(`${day.cityLabel} on ${day.date}: planned spend may exceed a comfortable daily soft target.`);
  }

  return {
    totalMin,
    totalMax,
    currency: tripBudget.currency,
    suspiciousItems,
    warnings,
    shouldLabelEstimated,
  };
};

const replaceBlockCostIfSuspicious = (
  block: ActivityBlock,
  day: DayPlan,
  suspiciousIds: Set<string>,
  budgetStyle: TripBudget["style"],
): ActivityBlock => {
  if (!suspiciousIds.has(block.id)) {
    return block;
  }
  const next = pricingService.estimateActivityCost({
    type: block.type,
    category: block.category,
    place: block.place,
    city: day.cityLabel,
    country: day.countryLabel,
    locationLabel: `${day.cityLabel}${day.countryLabel ? `, ${day.countryLabel}` : ""}`,
    budgetStyle,
  });
  return { ...block, estimatedCost: { ...next, certainty: "estimated" } };
};

/**
 * Replaces block costs that failed realism checks with deterministic profile ranges.
 */
export const repairDayPlanBudgetIfNeeded = (day: DayPlan, tripBudget: TripBudget): DayPlan => {
  const validation = validateDayPlanBudget(day, tripBudget);
  if (validation.suspiciousItems.length === 0) {
    return day;
  }
  const ids = new Set(validation.suspiciousItems.map((s) => s.itemId));
  return {
    ...day,
    blocks: day.blocks.map((block) => replaceBlockCostIfSuspicious(block, day, ids, tripBudget.style)),
  };
};

export const summarizeBudgetValidationForDay = (day: DayPlan, tripBudget: TripBudget): string[] => {
  const v = validateDayPlanBudget(day, tripBudget);
  const lines: string[] = [];
  for (const s of v.suspiciousItems) {
    lines.push(`${day.cityLabel}: ${s.reason} (item ${s.itemId}).`);
  }
  for (const w of v.warnings) {
    lines.push(w);
  }
  return lines;
};
