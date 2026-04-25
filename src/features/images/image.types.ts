export type ImageConfidence = "high" | "medium" | "low";

export type ImageResult = {
  url: string;
  /** Which tier supplied the image (for debugging / future attribution UI). */
  source: string;
  attributionRequired: boolean;
  attributionText?: string;
  confidence: ImageConfidence;
};

export type ImageResolveInput = {
  /** Stable id for caching (trip item id, event id, place id, etc.). */
  entityId: string;
  title: string;
  categoryHint?: string;
  locationHint?: string;
  /** 1 — already on the entity */
  existingImageUrl?: string | null;
  /** 2 — canonical image from app / AI payload */
  apiImageUrl?: string | null;
  /** 3 — venue or event provider thumbnail */
  providerImageUrl?: string | null;
  /** 4 — Google Places photo URL (caller must build if using Places API). */
  googlePlacesPhotoUrl?: string | null;
  latitude?: number;
  longitude?: number;
};
