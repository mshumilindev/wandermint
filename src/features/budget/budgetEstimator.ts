import type { ActivityBlock, CostRange } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { TripBudget } from "../../entities/trip/model";
import { pricingService } from "../../services/pricing/pricingService";
import type { BudgetEstimate, BudgetEstimateConfidence } from "./budget.types";

const conversionToEur: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  PLN: 0.23,
  JPY: 0.0061,
  CZK: 0.04,
  GBP: 1.17,
};

const convertAmount = (value: number, fromCurrency: string, toCurrency: string): number => {
  if (fromCurrency === toCurrency) {
    return value;
  }
  const fromRate = conversionToEur[fromCurrency];
  const toRate = conversionToEur[toCurrency];
  if (!fromRate || !toRate) {
    return value;
  }
  return Math.round((value * fromRate) / toRate);
};

const certaintyToConfidence = (certainty: CostRange["certainty"]): BudgetEstimateConfidence => {
  if (certainty === "exact") {
    return "medium";
  }
  if (certainty === "estimated") {
    return "medium";
  }
  return "low";
};

/**
 * Turns a `CostRange` into a `BudgetEstimate`, widening degenerate single-point bands
 * so we never treat one number as ground truth (especially from AI-shaped payloads).
 */
export const costRangeToBudgetEstimate = (range: CostRange, source: string): BudgetEstimate => {
  let { min, max } = range;
  let confidence = certaintyToConfidence(range.certainty);
  let src = source;

  if (min === max && max > 0) {
    const pad = Math.max(1, Math.round(max * 0.12));
    min = Math.max(0, min - pad);
    max = max + pad;
    confidence = "low";
    src = `${source}+widened_point_estimate`;
  }

  return {
    min,
    max,
    currency: range.currency,
    confidence,
    source: src,
  };
};

export const estimateBlockBudget = (
  block: ActivityBlock,
  day: DayPlan,
  budgetStyle: TripBudget["style"],
): BudgetEstimate => {
  const range = pricingService.estimateActivityCost({
    type: block.type,
    category: block.category,
    place: block.place,
    city: day.cityLabel,
    country: day.countryLabel,
    locationLabel: `${day.cityLabel}${day.countryLabel ? `, ${day.countryLabel}` : ""}`,
    budgetStyle,
  });
  return costRangeToBudgetEstimate(range, "pricing_profile");
};

export const sumEstimatesInCurrency = (estimates: BudgetEstimate[], targetCurrency: string): { min: number; max: number } => {
  let min = 0;
  let max = 0;
  for (const e of estimates) {
    min += convertAmount(e.min, e.currency, targetCurrency);
    max += convertAmount(e.max, e.currency, targetCurrency);
  }
  return { min, max };
};
