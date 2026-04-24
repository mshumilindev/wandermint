import { z } from "zod";
import { dayPlanSchema } from "../../entities/day-plan/schemas";
import { localScenarioSchema } from "../../entities/local-scenario/schemas";
import { tripSchema } from "../../entities/trip/schemas";
import { replanProposalSchema } from "../../entities/replan/schemas";

export const generatedTripOptionSchema = z.object({
  optionId: z.string(),
  label: z.string(),
  positioning: z.string(),
  trip: tripSchema,
  days: z.array(dayPlanSchema).min(1),
  tradeoffs: z.array(z.string()),
});

export const generatedTripOptionsSchema = z.object({
  options: z.array(generatedTripOptionSchema).min(3).max(3),
});

export const generatedLocalScenariosSchema = z.object({
  scenarios: z.array(localScenarioSchema).min(0).max(20),
});

export const chatReplanResponseSchema = z.object({
  assistantMessage: z.string(),
  proposal: replanProposalSchema.optional(),
  structuredPatchSummary: z.string().optional(),
});

export type GeneratedTripOptions = z.infer<typeof generatedTripOptionsSchema>;
export type GeneratedLocalScenarios = z.infer<typeof generatedLocalScenariosSchema>;
export type ChatReplanResponse = z.infer<typeof chatReplanResponseSchema>;
