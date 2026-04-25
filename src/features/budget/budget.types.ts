export type BudgetEstimateConfidence = "high" | "medium" | "low";

/**
 * A numeric range for a spend line — never a single authoritative AI figure.
 */
export type BudgetEstimate = {
  min: number;
  max: number;
  currency: string;
  confidence: BudgetEstimateConfidence;
  /** Short provenance label (e.g. `pricing_profile`, `widened_point_estimate`). */
  source: string;
};

export type BudgetSuspiciousItem = {
  itemId: string;
  reason: string;
};

export type BudgetValidationResult = {
  totalMin: number;
  totalMax: number;
  currency: string;
  suspiciousItems: BudgetSuspiciousItem[];
  warnings: string[];
  /** True when any estimate relied on weak signals or widened point costs. */
  shouldLabelEstimated: boolean;
};
