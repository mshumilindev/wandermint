import { z } from "zod";
import { activityBlockSchema, costRangeSchema, movementLegSchema } from "../day-plan/schemas";

export const localScenarioSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  theme: z.string(),
  locationLabel: z.string(),
  estimatedDurationMinutes: z.number().int().positive(),
  estimatedCostRange: costRangeSchema,
  weatherFit: z.enum(["excellent", "good", "risky", "indoor"]),
  routeLogic: z.string(),
  blocks: z.array(activityBlockSchema).min(2).max(4),
  movementLegs: z.array(movementLegSchema).optional(),
  alternatives: z.array(z.string()),
  createdAt: z.string(),
  savedAt: z.string().optional(),
});
