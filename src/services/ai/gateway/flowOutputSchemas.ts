import { z } from "zod";

/** Structured post-trip insights only (bounded NL in `summaryForUi`). */
export const postTripAnalysisResponseSchema = z.object({
  structuredInsights: z
    .array(
      z.object({
        key: z.string().max(120),
        detail: z.string().max(2000),
        weight: z.enum(["low", "medium", "high"]).optional(),
      }),
    )
    .max(24),
  followUpActions: z
    .array(
      z.object({
        id: z.string().max(120),
        label: z.string().max(400),
        kind: z.enum(["preference", "trip_style", "logistics", "other"]),
      }),
    )
    .max(20),
  summaryForUi: z.string().max(2000),
});

export const liveDecisionSupportResponseSchema = z.object({
  statusLine: z.string().max(400),
  rationaleBullets: z.array(z.string().max(500)).max(10),
  suggestedUiActions: z
    .array(
      z.enum([
        "continue",
        "skip_next_low_priority",
        "shorten_current_item",
        "reorder_remaining",
        "end_day",
        "open_day_editor",
      ]),
    )
    .max(6),
  confidence: z.enum(["low", "medium", "high"]),
});

export type PostTripAnalysisResponse = z.infer<typeof postTripAnalysisResponseSchema>;
export type LiveDecisionSupportResponse = z.infer<typeof liveDecisionSupportResponseSchema>;
