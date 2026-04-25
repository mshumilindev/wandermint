export type MediaEntityType = "trip" | "activity" | "place" | "scenario" | "saved_item";

export type MediaAttachmentSource = "instagram" | "manual" | "wikimedia" | "fallback";

export type MediaFetchStatus = "pending" | "resolved" | "failed";

export type InstagramGraphMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export interface EntityMediaAttachment {
  id: string;
  entityId: string;
  entityType: MediaEntityType;
  source: MediaAttachmentSource;
  sourceUrl: string;
  permalink?: string;
  mediaType?: InstagramGraphMediaType;
  thumbnailUrl?: string;
  mediaUrl?: string;
  caption?: string;
  altText?: string;
  fetchedAt?: string;
  fetchStatus: MediaFetchStatus;
  errorReason?: string;
  /** True when oEmbed/html hints at a multi-item post (first frame only in UI). */
  isCarouselHint?: boolean;
}
