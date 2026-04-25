import { buildImageCacheKey, resolveUniversalImage } from "../../features/images/imageResolver";
import type { ImageResolveInput, ImageResult } from "../../features/images/image.types";
import { preferHigherResolutionImageUrl } from "./providerImageUrl";
import { buildWikimediaSrcSet, rescaleWikimediaThumbUrl, wikimediaUrlSupportsWidthThumb } from "./wikimediaThumb";

/** In-memory: resolved layout (srcSet) varies by variant for the same underlying image URL. */
const memoryResultCache = new Map<string, Promise<ResolvedEntityImage>>();

export type EntityImageVariant =
  | "tripCard"
  | "scenarioCard"
  | "savedItem"
  | "activityThumb"
  | "optionPreview"
  | "compact";

export interface EntityImageVariantLayout {
  aspectRatio: string;
  minHeight?: number | Record<string, number>;
  sizesAttr: string;
  targetWidth: number;
  srcWidths: readonly number[];
}

export const ENTITY_IMAGE_VARIANT_LAYOUT: Record<EntityImageVariant, EntityImageVariantLayout> = {
  tripCard: {
    aspectRatio: "16 / 9",
    minHeight: { xs: 168, sm: 188 },
    sizesAttr: "(max-width: 600px) 94vw, (max-width: 1200px) 46vw, min(720px, 42vw)",
    targetWidth: 1280,
    srcWidths: [640, 960, 1280, 1600],
  },
  scenarioCard: {
    aspectRatio: "16 / 9",
    minHeight: { xs: 176, md: 200 },
    sizesAttr: "(max-width: 600px) 94vw, (max-width: 900px) 48vw, (max-width: 1536px) 32vw, 520px",
    targetWidth: 1440,
    srcWidths: [720, 960, 1280, 1600],
  },
  savedItem: {
    aspectRatio: "16 / 9",
    minHeight: { xs: 168, sm: 184 },
    sizesAttr: "(max-width: 600px) 94vw, (max-width: 1200px) 48vw, min(640px, 40vw)",
    targetWidth: 1280,
    srcWidths: [640, 960, 1280],
  },
  activityThumb: {
    aspectRatio: "4 / 3",
    minHeight: { xs: 128, sm: 104 },
    sizesAttr: "(max-width: 600px) 92vw, (max-width: 1200px) 46vw, min(360px, 32vw)",
    targetWidth: 800,
    srcWidths: [400, 560, 720, 960],
  },
  optionPreview: {
    aspectRatio: "3 / 2",
    minHeight: { xs: 148, sm: 156 },
    sizesAttr: "(max-width: 600px) 94vw, (max-width: 1200px) 46vw, min(520px, 38vw)",
    targetWidth: 1120,
    srcWidths: [480, 720, 960, 1280],
  },
  compact: {
    aspectRatio: "16 / 9",
    minHeight: { xs: 96, sm: 104 },
    sizesAttr: "(max-width: 900px) 88vw, min(440px, 40vw)",
    targetWidth: 720,
    srcWidths: [440, 640, 960],
  },
};

export interface EntityImageRequest {
  /** Stable cache id; when omitted, a deterministic legacy key is derived from text hints. */
  entityId?: string;
  title: string;
  locationHint?: string;
  categoryHint?: string;
  existingImageUrl?: string | null;
  apiImageUrl?: string | null;
  providerImageUrl?: string | null;
  googlePlacesPhotoUrl?: string | null;
  latitude?: number;
  longitude?: number;
  variant: EntityImageVariant;
}

export interface ResolvedEntityImage {
  primaryUrl: string | null;
  srcSet?: string;
  sizes?: string;
  fallbackCss: string;
  /** When set, prefer showing near image in future UI (not used by EntityPreviewImage yet). */
  attributionText?: string;
}

const hashString = (input: string): number => {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return hash >>> 0;
};

export const buildEntityImageAlt = (title: string, locationHint?: string, categoryHint?: string): string =>
  [title.trim(), locationHint?.trim(), categoryHint?.trim()].filter(Boolean).join(" · ");

const deterministicFallbackCss = (title: string, categoryHint?: string): string => {
  const seed = hashString(`${title}|${categoryHint ?? ""}`);
  const hue = seed % 360;
  const hue2 = (seed * 17) % 360;
  return `linear-gradient(135deg, hsla(${hue}, 46%, 24%, 0.96), hsla(${hue2}, 52%, 14%, 0.98))`;
};

export const getEntityImagePlaceholderCss = (title: string, categoryHint?: string): string =>
  deterministicFallbackCss(title, categoryHint);

const isProbablyWikimedia = (url: string): boolean =>
  url.includes("wikimedia.org") || url.includes("wikipedia.org") || url.includes("wikidata.org");

const optimizeRemoteUrl = (
  url: string,
  targetWidth: number,
  srcWidths: readonly number[],
  sizesAttr: string,
  fallbackCss: string,
): ResolvedEntityImage => {
  if (url.startsWith("data:")) {
    return { primaryUrl: url, fallbackCss };
  }
  const sharpened = preferHigherResolutionImageUrl(url, targetWidth);
  const primary =
    isProbablyWikimedia(sharpened) && wikimediaUrlSupportsWidthThumb(sharpened)
      ? rescaleWikimediaThumbUrl(sharpened, targetWidth)
      : sharpened;
  const srcSet = isProbablyWikimedia(sharpened) ? buildWikimediaSrcSet(sharpened, srcWidths) : undefined;
  return {
    primaryUrl: primary,
    srcSet,
    sizes: srcSet ? sizesAttr : undefined,
    fallbackCss,
  };
};

const stableEntityId = (request: EntityImageRequest): string => {
  const trimmed = request.entityId?.trim();
  if (trimmed) {
    return trimmed;
  }
  const legacy = `${request.title.trim()}|${request.locationHint?.trim() ?? ""}|${request.categoryHint?.trim() ?? ""}|${request.existingImageUrl?.trim() ?? ""}`;
  return `legacy:${hashString(legacy)}`;
};

const toImageResolveInput = (request: EntityImageRequest): ImageResolveInput => ({
  entityId: stableEntityId(request),
  title: request.title,
  locationHint: request.locationHint,
  categoryHint: request.categoryHint,
  existingImageUrl: request.existingImageUrl,
  apiImageUrl: request.apiImageUrl,
  providerImageUrl: request.providerImageUrl,
  googlePlacesPhotoUrl: request.googlePlacesPhotoUrl,
  latitude: request.latitude,
  longitude: request.longitude,
});

const resolvedEntityCacheKey = (request: EntityImageRequest): string => {
  const input = toImageResolveInput(request);
  return `res:${request.variant}|${buildImageCacheKey(input)}`;
};

const mapImageResultToResolved = (
  result: ImageResult,
  layout: EntityImageVariantLayout,
  fallbackCss: string,
): ResolvedEntityImage => {
  const url = result.url.trim();
  if (!url) {
    return { primaryUrl: null, fallbackCss };
  }
  const resolved = optimizeRemoteUrl(url, layout.targetWidth, layout.srcWidths, layout.sizesAttr, fallbackCss);
  return result.attributionText ? { ...resolved, attributionText: result.attributionText } : resolved;
};

const resolveUncached = async (request: EntityImageRequest): Promise<ResolvedEntityImage> => {
  const layout = ENTITY_IMAGE_VARIANT_LAYOUT[request.variant];
  const fallbackCss = deterministicFallbackCss(request.title, request.categoryHint);
  const imageResult = await resolveUniversalImage(toImageResolveInput(request));
  return mapImageResultToResolved(imageResult, layout, fallbackCss);
};

export const resolveEntityImage = async (request: EntityImageRequest): Promise<ResolvedEntityImage> => {
  const key = resolvedEntityCacheKey(request);
  if (!memoryResultCache.has(key)) {
    memoryResultCache.set(key, resolveUncached(request));
  }
  return memoryResultCache.get(key) as Promise<ResolvedEntityImage>;
};
