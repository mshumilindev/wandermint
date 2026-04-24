import { z } from "zod";

export const travelMemorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  city: z.string(),
  country: z.string(),
  datePrecision: z.enum(["exact", "month"]).default("exact"),
  startDate: z.string(),
  endDate: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  geoLabel: z.string().optional(),
  style: z.enum(["culture", "food", "nature", "nightlife", "rest", "mixed"]),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
