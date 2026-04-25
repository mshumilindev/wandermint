import { wikimediaImageService } from "../../services/media/wikimediaImageService";
import { ANALYTICS_EVENTS } from "../observability/analyticsEvents";
import { logAnalyticsEvent } from "../observability/appLogger";
import { getOrResolveImage } from "./imageCache";
import type { ImageResolveInput, ImageResult } from "./image.types";

const hashString = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
};

export const buildImageCacheKey = (input: ImageResolveInput): string => {
  const tier = [input.existingImageUrl, input.apiImageUrl, input.providerImageUrl, input.googlePlacesPhotoUrl]
    .map((x) => (x ?? "").trim())
    .join("|");
  return `${input.entityId}|${hashString(tier)}`;
};

const isHttpUrl = (u: string): boolean => /^https?:\/\//i.test(u.trim());

const firstHttpUrl = (...candidates: Array<string | null | undefined>): string | null => {
  for (const c of candidates) {
    const t = typeof c === "string" ? c.trim() : "";
    if (t.length > 8 && isHttpUrl(t)) {
      return t;
    }
  }
  return null;
};

const DEFAULT_STOCK_LIST: readonly string[] = [
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=960&q=70",
  "https://images.unsplash.com/photo-1526779259212-939e23888cfc?auto=format&fit=crop&w=960&q=70",
];

const STOCK_BY_BUCKET: Record<string, readonly string[]> = {
  food: [
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=960&q=70",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=960&q=70",
  ],
  museum: [
    "https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=960&q=70",
    "https://images.unsplash.com/photo-1566127444979-b3d2b64d6c40?auto=format&fit=crop&w=960&q=70",
  ],
  nature: [
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=960&q=70",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=960&q=70",
  ],
  event: [
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=960&q=70",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=960&q=70",
  ],
  city: [
    "https://images.unsplash.com/photo-1496568816309-51d7c20e3b44?auto=format&fit=crop&w=960&q=70",
    "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=960&q=70",
  ],
  default: DEFAULT_STOCK_LIST,
};

const bucketKey = (categoryHint?: string, title?: string): string => {
  const hay = `${categoryHint ?? ""} ${title ?? ""}`.toLowerCase();
  if (/(meal|food|restaurant|dining|brunch|lunch|dinner|cafe|coffee|bar|pub)/.test(hay)) {
    return "food";
  }
  if (/(museum|gallery|exhibit)/.test(hay)) {
    return "museum";
  }
  if (/(park|garden|hike|trail|nature|beach|mountain|viewpoint)/.test(hay)) {
    return "nature";
  }
  if (/(concert|festival|show|theatre|theater|gig|music|venue|stadium|sport)/.test(hay)) {
    return "event";
  }
  if (/(city|walking|neighborhood|district|plaza|square)/.test(hay)) {
    return "city";
  }
  return "default";
};

const telemetryCategoryBucket = (categoryHint?: string): string => bucketKey(categoryHint, undefined);

const pickStockImage = (input: ImageResolveInput): ImageResult => {
  const bucket = bucketKey(input.categoryHint, input.title);
  const list: readonly string[] = (STOCK_BY_BUCKET as Record<string, readonly string[]>)[bucket] ?? DEFAULT_STOCK_LIST;
  const idx = hashString(`${bucket}|${input.title}|${input.locationHint ?? ""}`) % list.length;
  const url = list[idx] ?? list[0];
  if (!url) {
    return genericSvgResult(input);
  }
  return {
    url,
    source: "unsplash_curated",
    attributionRequired: true,
    attributionText: "Photo via Unsplash",
    confidence: "low",
  };
};

const genericSvgResult = (input: ImageResolveInput): ImageResult => {
  const h1 = hashString(input.title) % 360;
  const h2 = hashString(`${input.title}|${input.categoryHint ?? ""}`) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${h1},42%,22%)"/><stop offset="100%" stop-color="hsl(${h2},48%,14%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    source: "local_generic",
    attributionRequired: false,
    confidence: "low",
  };
};

const googleStaticMapIfConfigured = (input: ImageResolveInput): ImageResult | null => {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!key || input.latitude === undefined || input.longitude === undefined) {
    return null;
  }
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(`${input.latitude},${input.longitude}`)}&zoom=15&size=640x480&scale=2&key=${encodeURIComponent(key)}`;
  return {
    url,
    source: "google_static_map",
    attributionRequired: true,
    attributionText: "Map data © Google",
    confidence: "medium",
  };
};

const fetchWikidataCommonsImage = async (title: string, locationHint?: string): Promise<string | null> => {
  try {
    const search = [title, locationHint].filter(Boolean).join(" ").trim();
    if (search.length < 2) {
      return null;
    }
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(search)}&language=en&format=json&origin=*&limit=1`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      return null;
    }
    const searchData = (await searchResponse.json()) as { search?: Array<{ id: string }> };
    const entityId = searchData.search?.[0]?.id;
    if (!entityId) {
      return null;
    }
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(entityId)}&props=claims&format=json&origin=*`;
    const entityResponse = await fetch(entityUrl);
    if (!entityResponse.ok) {
      return null;
    }
    const entityData = (await entityResponse.json()) as {
      entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }>;
    };
    const claims = entityData.entities?.[entityId]?.claims?.P18;
    const fileName = claims?.[0]?.mainsnak?.datavalue?.value;
    if (typeof fileName !== "string" || !fileName.startsWith("File:")) {
      return null;
    }
    const enc = encodeURIComponent(fileName);
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=1280`;
  } catch {
    return null;
  }
};

const resolvePipeline = async (input: ImageResolveInput): Promise<ImageResult> => {
  const direct = firstHttpUrl(
    input.existingImageUrl,
    input.apiImageUrl,
    input.providerImageUrl,
    input.googlePlacesPhotoUrl,
  );
  if (direct) {
    const source =
      direct === input.existingImageUrl?.trim()
        ? "existing"
        : direct === input.apiImageUrl?.trim()
          ? "api"
          : direct === input.providerImageUrl?.trim()
            ? "provider"
            : "google_places";
    return { url: direct, source, attributionRequired: false, confidence: "high" };
  }

  const staticMap = googleStaticMapIfConfigured(input);
  if (staticMap) {
    return staticMap;
  }

  try {
    const wiki = await wikimediaImageService.resolveImage({
      title: input.title,
      locationHint: input.locationHint,
      categoryHint: input.categoryHint,
    });
    if (wiki) {
      return {
        url: wiki,
        source: "wikimedia_summary",
        attributionRequired: true,
        attributionText: "Wikimedia / Wikipedia",
        confidence: "medium",
      };
    }

    const commons = await fetchWikidataCommonsImage(input.title, input.locationHint);
    if (commons) {
      return {
        url: commons,
        source: "wikimedia_commons",
        attributionRequired: true,
        attributionText: "Wikimedia Commons",
        confidence: "medium",
      };
    }
  } catch {
    logAnalyticsEvent(ANALYTICS_EVENTS.image_resolution_failed, {
      stage: "resolve_pipeline",
      categoryBucket: telemetryCategoryBucket(input.categoryHint),
      hadDirectUrl: Boolean(
        firstHttpUrl(
          input.existingImageUrl,
          input.apiImageUrl,
          input.providerImageUrl,
          input.googlePlacesPhotoUrl,
        ),
      ),
      hadCoordinateFields: input.latitude !== undefined && input.longitude !== undefined,
    });
  }

  return pickStockImage(input);
};

/**
 * Universal image resolution with tiered sources, deduped by {@link buildImageCacheKey}.
 * Always returns a usable `url` (stock or inline SVG as last resort).
 */
export const resolveUniversalImage = async (input: ImageResolveInput): Promise<ImageResult> => {
  const key = buildImageCacheKey(input);
  return getOrResolveImage(key, async () => {
    try {
      const r = await resolvePipeline(input);
      if (r.url?.trim()) {
        return r;
      }
    } catch {
      logAnalyticsEvent(ANALYTICS_EVENTS.image_resolution_failed, {
        stage: "resolve_universal",
        categoryBucket: telemetryCategoryBucket(input.categoryHint),
        hadDirectUrl: Boolean(
          firstHttpUrl(
            input.existingImageUrl,
            input.apiImageUrl,
            input.providerImageUrl,
            input.googlePlacesPhotoUrl,
          ),
        ),
        hadCoordinateFields: input.latitude !== undefined && input.longitude !== undefined,
      });
    }
    return genericSvgResult(input);
  });
};
