import type { BudgetCategoryConfidence } from "../types/tripBudget.types";

const rank: Record<BudgetCategoryConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unavailable: 0,
};

export const rollupBudgetConfidence = (levels: BudgetCategoryConfidence[]): "high" | "medium" | "low" => {
  if (levels.length === 0) {
    return "low";
  }
  const hasUnavailable = levels.includes("unavailable");
  const filtered = levels.filter((l) => l !== "unavailable");
  if (filtered.length === 0) {
    return "low";
  }
  const min = Math.min(...filtered.map((l) => rank[l]));
  if (min <= 1) {
    return "low";
  }
  if (min === 2) {
    return "medium";
  }
  return hasUnavailable ? "medium" : "high";
};
