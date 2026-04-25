import { z } from "zod";
import { dayPlanSchema } from "../../entities/day-plan/schemas";
import { localScenarioSchema } from "../../entities/local-scenario/schemas";
import { tripSchema } from "../../entities/trip/schemas";
import { replanProposalSchema } from "../../entities/replan/schemas";

export const planExplanationSchema = z.object({
  summary: z.string(),
  assumptions: z.array(z.string()),
  includedBecause: z.array(z.string()),
  excludedBecause: z.array(z.string()),
  risks: z.array(z.string()),
  lowConfidenceFields: z.array(z.string()),
});

export type PlanExplanation = z.infer<typeof planExplanationSchema>;

export const generatedTripOptionSchema = z.object({
  optionId: z.string(),
  label: z.string(),
  positioning: z.string(),
  trip: tripSchema,
  days: z.array(dayPlanSchema).min(1),
  tradeoffs: z.array(z.string()),
  planExplanation: planExplanationSchema.optional(),
});

export const generatedTripOptionsSchema = z.object({
  options: z.array(generatedTripOptionSchema).min(1).max(5),
});

export const generatedLocalScenariosSchema = z.object({
  scenarios: z.array(localScenarioSchema).min(0).max(20),
});

export const chatReplanResponseSchema = z.object({
  assistantMessage: z.string(),
  proposal: replanProposalSchema.optional(),
  structuredPatchSummary: z.string().optional(),
});

export const localScenarioChatResponseSchema = z.object({
  assistantMessage: z.string(),
  updatedScenario: localScenarioSchema.optional(),
});

export type GeneratedTripOptions = z.infer<typeof generatedTripOptionsSchema>;
export type GeneratedLocalScenarios = z.infer<typeof generatedLocalScenariosSchema>;
export type ChatReplanResponse = z.infer<typeof chatReplanResponseSchema>;
export type LocalScenarioChatResponse = z.infer<typeof localScenarioChatResponseSchema>;
