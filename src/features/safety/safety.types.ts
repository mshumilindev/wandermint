export type SafetyRiskLevel = "low" | "medium" | "high" | "unknown";

/**
 * Conservative, structural safety read for a single plan step.
 * Reasons are stable machine keys (map to copy in UI) — never demographic or neighborhood stereotypes.
 */
export type SafetyAssessment = {
  itemId: string;
  riskLevel: SafetyRiskLevel;
  /** Machine-readable keys for localization (e.g. `late_evening_outdoor_remote`). */
  reasons: string[];
};
