import { z } from "zod";

export const travelPartyContextSchema = z.enum(["solo", "couple", "friends", "family", "group"]);

export const familiarityModeSchema = z.enum(["novelty", "balanced", "comfort"]);

export const placeExperienceMemorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  placeKey: z.string(),
  provider: z.string().optional(),
  providerPlaceId: z.string().optional(),
  placeName: z.string(),
  experienceCategory: z.string().optional(),
  visitCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  lastVisitedAt: z.string().nullable().optional(),
  wasCompleted: z.boolean(),
  isFavorite: z.boolean(),
  notInterested: z.boolean().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  tags: z.array(z.string()),
  travelPartyContexts: z.array(travelPartyContextSchema),
  contextVisitCounts: z.object({
    solo: z.number().int().nonnegative().optional(),
    couple: z.number().int().nonnegative().optional(),
    friends: z.number().int().nonnegative().optional(),
    family: z.number().int().nonnegative().optional(),
    group: z.number().int().nonnegative().optional(),
  }),
  showToOthersCandidate: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
