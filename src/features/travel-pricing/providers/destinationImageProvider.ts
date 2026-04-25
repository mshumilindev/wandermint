import { z } from "zod";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: { url: string; alt: string; attribution?: string } | null }>();

const wikiSchema = z.object({
  query: z.object({
    pages: z.record(
      z.object({
        thumbnail: z.object({ source: z.string() }).optional(),
        title: z.string().optional(),
      }),
    ),
  }),
});

/**
 * Wikipedia page image (CC BY-SA) — requires attribution in UI when used.
 */
export const fetchDestinationHeroImage = async (params: { city?: string; country: string }): Promise<{
  url: string;
  alt: string;
  attribution?: string;
} | null> => {
  const title = [params.city, params.country].filter(Boolean).join(", ");
  if (!title.trim()) {
    return null;
  }
  const key = title.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("format", "json");
  url.searchParams.set("pithumbsize", "640");
  url.searchParams.set("origin", "*");

  const response = await fetch(url.toString());
  if (!response.ok) {
    cache.set(key, { value: null, expiresAt: Date.now() + TTL_MS });
    return null;
  }
  const parsed = wikiSchema.safeParse(await response.json());
  if (!parsed.success) {
    cache.set(key, { value: null, expiresAt: Date.now() + TTL_MS });
    return null;
  }
  const pages = parsed.data.query.pages;
  const first = Object.values(pages)[0];
  const src = first?.thumbnail?.source;
  if (!src) {
    cache.set(key, { value: null, expiresAt: Date.now() + TTL_MS });
    return null;
  }
  const value = {
    url: src,
    alt: first?.title ?? title,
    attribution: "Wikipedia / Wikimedia Commons (check file license on Wikimedia)",
  };
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
};
