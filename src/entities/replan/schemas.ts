import { z } from "zod";

export const replanProposalSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tripId: z.string(),
  sourceDayId: z.string().optional(),
  createdAt: z.string(),
  reason: z.enum(["unfinished_day", "weather_change", "price_change", "late_start", "user_request"]),
  summary: z.string(),
  actions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["move_activity", "remove_activity", "replace_activity", "compress_day"]),
      blockId: z.string().optional(),
      fromDayId: z.string().optional(),
      toDayId: z.string().optional(),
      targetStartTime: z.string().optional(),
      targetEndTime: z.string().optional(),
      deleteOriginal: z.boolean().optional(),
      replacementTitle: z.string().optional(),
      replacementDescription: z.string().optional(),
      replacementPlace: z
        .object({
          provider: z.string(),
          providerPlaceId: z.string().optional(),
          name: z.string(),
          address: z.string().optional(),
          city: z.string().optional(),
          country: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          openingHoursLabel: z.string().optional(),
          priceLevel: z.number().optional(),
          rating: z.number().optional(),
          capturedAt: z.string(),
        })
        .optional(),
      replacementEstimatedCost: z
        .object({
          min: z.number(),
          max: z.number(),
          currency: z.string(),
          certainty: z.enum(["exact", "estimated", "unknown"]),
        })
        .optional(),
      replacementSourceSnapshots: z
        .array(
          z.object({
            provider: z.string(),
            providerPlaceId: z.string().optional(),
            name: z.string(),
            address: z.string().optional(),
            city: z.string().optional(),
            country: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            openingHoursLabel: z.string().optional(),
            priceLevel: z.number().optional(),
            rating: z.number().optional(),
            capturedAt: z.string(),
          }),
        )
        .optional(),
      replacementAlternatives: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            reason: z.string(),
            estimatedCost: z
              .object({
                min: z.number(),
                max: z.number(),
                currency: z.string(),
                certainty: z.enum(["exact", "estimated", "unknown"]),
              })
              .optional(),
            place: z
              .object({
                provider: z.string(),
                providerPlaceId: z.string().optional(),
                name: z.string(),
                address: z.string().optional(),
                city: z.string().optional(),
                country: z.string().optional(),
                latitude: z.number().optional(),
                longitude: z.number().optional(),
                openingHoursLabel: z.string().optional(),
                priceLevel: z.number().optional(),
                rating: z.number().optional(),
                capturedAt: z.string(),
              })
              .optional(),
          }),
        )
        .optional(),
      rationale: z.string(),
    }),
  ),
});
