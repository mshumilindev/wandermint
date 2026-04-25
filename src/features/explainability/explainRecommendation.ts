import type { RankedRecommendation } from "../recommendations/recommendation.types";
import type { PlanExplanation } from "./planExplanation.types";

/**
 * Turns deterministic ranking output into the same {@link PlanExplanation} shape used for full plans.
 */
export const explainRecommendation = (ranked: RankedRecommendation): PlanExplanation => {
  const low: string[] = [];
  if (ranked.confidence === "low") {
    low.push(`Overall ranking confidence is low for "${ranked.item.title}".`);
  }
  if (ranked.item.travelEstimateConfidence === "low") {
    low.push(`Travel time from the previous stop to "${ranked.item.title}" is low-confidence (${ranked.item.travelTimeFromPreviousMinutes}m declared).`);
  }
  if (ranked.item.locationResolutionStatus === "estimated" || ranked.item.locationResolutionStatus === "missing") {
    low.push(`Location for "${ranked.item.title}" is ${ranked.item.locationResolutionStatus ?? "unset"} — check on a map before navigating.`);
  }

  return {
    summary: `Candidate "${ranked.item.title}" scored ${Math.round(ranked.score)} with ${ranked.confidence} confidence (deterministic ranker).`,
    assumptions: [
      `Uses declared window ${ranked.item.plannedStartTime ?? "?"}–${ranked.item.plannedEndTime ?? "?"} and duration ${ranked.item.estimatedDurationMinutes}m.`,
    ],
    includedBecause:
      ranked.reasons.length > 0
        ? ranked.reasons
        : [`Ranker held "${ranked.item.title}" as type ${ranked.item.type} with priority ${ranked.item.priority} (no positive scoring lines).`],
    excludedBecause: [],
    risks: ranked.penalties,
    lowConfidenceFields: low,
  };
};
