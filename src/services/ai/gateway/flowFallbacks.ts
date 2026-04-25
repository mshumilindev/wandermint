import type { ChatReplanResponse } from "../schemas";
import type { LiveDecisionSupportResponse, PostTripAnalysisResponse } from "./flowOutputSchemas";

export const fallbackChatReplanResponse = (): ChatReplanResponse => ({
  assistantMessage:
    "I could not safely read the planner response. Your trip data was not changed. Try again in a moment, or make edits directly in the day plan.",
  structuredPatchSummary: "No structured patch applied (gateway validation fallback).",
  proposal: undefined,
});

export const fallbackPostTripAnalysisResponse = (): PostTripAnalysisResponse => ({
  structuredInsights: [
    {
      key: "analysis_unavailable",
      detail: "The review service returned an unexpected shape. No insights were applied.",
      weight: "low",
    },
  ],
  followUpActions: [],
  summaryForUi: "We could not complete the structured review. Your saved trip data is unchanged.",
});

export const fallbackLiveDecisionSupportResponse = (): LiveDecisionSupportResponse => ({
  statusLine: "Co-pilot data unavailable",
  rationaleBullets: ["The live assistant response did not validate. Continue with your current plan or open the day editor."],
  suggestedUiActions: ["continue"],
  confidence: "low",
});
