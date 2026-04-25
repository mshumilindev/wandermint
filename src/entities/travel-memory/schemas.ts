import { z } from "zod";
import { festivalSelectionSchema } from "../events/eventLookup.schema";
import { entityMediaAttachmentSchema } from "../media/schemas";

const memoryAnchorEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  eventDate: z.string(),
  endDate: z.string().optional(),
  city: z.string(),
  country: z.string(),
  countryCode: z.string().optional(),
  venue: z.string().optional(),
  artistName: z.string().optional(),
  festivalName: z.string().optional(),
  startTime: z.string().optional(),
  timezone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  sourceUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  ticketUrl: z.string().optional(),
  provider: z.enum(["ticketmaster", "bandsintown", "songkick", "manual", "fallback"]).optional(),
  providerEventId: z.string().optional(),
  eventType: z.enum(["concert", "festival", "multi_day_festival", "venue_event", "unknown"]).optional(),
  festivalSelection: festivalSelectionSchema.optional(),
});

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
  anchorEvents: z.array(memoryAnchorEventSchema).optional(),
  mediaAttachments: z.array(entityMediaAttachmentSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
