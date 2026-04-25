import { z } from "zod";

export const festivalSelectionSchema = z.object({
  mode: z.enum(["all_days", "specific_days"]),
  selectedDates: z.array(z.string()),
  originalStartDate: z.string(),
  originalEndDate: z.string(),
});

export const eventLookupResultSchema = z.object({
  id: z.string(),
  provider: z.enum(["ticketmaster", "bandsintown", "songkick", "manual", "fallback"]),
  providerEventId: z.string().optional(),
  title: z.string(),
  artistName: z.string().optional(),
  festivalName: z.string().optional(),
  eventType: z.enum(["concert", "festival", "multi_day_festival", "venue_event", "unknown"]),
  venueName: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  timezone: z.string().optional(),
  imageUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  ticketUrl: z.string().optional(),
  lineup: z.array(z.string()).optional(),
  description: z.string().optional(),
  confidence: z.number(),
});

export const eventSearchResponseSchema = z.object({
  results: z.array(eventLookupResultSchema),
  warnings: z.array(z.string()).optional(),
});
