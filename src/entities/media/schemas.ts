import { z } from "zod";

export const mediaEntityTypeSchema = z.enum(["trip", "activity", "place", "scenario", "saved_item"]);
export const mediaAttachmentSourceSchema = z.enum(["instagram", "manual", "wikimedia", "fallback"]);
export const mediaFetchStatusSchema = z.enum(["pending", "resolved", "failed"]);
export const instagramGraphMediaTypeSchema = z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);

export const entityMediaAttachmentSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  entityType: mediaEntityTypeSchema,
  source: mediaAttachmentSourceSchema,
  sourceUrl: z.string(),
  permalink: z.string().optional(),
  mediaType: instagramGraphMediaTypeSchema.optional(),
  thumbnailUrl: z.string().optional(),
  mediaUrl: z.string().optional(),
  caption: z.string().optional(),
  altText: z.string().optional(),
  fetchedAt: z.string().optional(),
  fetchStatus: mediaFetchStatusSchema,
  errorReason: z.string().optional(),
  isCarouselHint: z.boolean().optional(),
});
