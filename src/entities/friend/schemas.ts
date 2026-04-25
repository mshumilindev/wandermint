import { z } from "zod";

export const friendCoordinatesSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const friendLocationSchema = z.object({
  label: z.string().optional(),
  city: z.string().min(1),
  country: z.string().optional(),
  address: z.string().optional(),
  coordinates: friendCoordinatesSchema.optional(),
});

export const friendSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: friendLocationSchema,
  avatarUrl: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
