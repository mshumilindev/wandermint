import { z } from "zod";
import { publicGeoProvider } from "../providers/publicGeoProvider";
import type { PlaceCandidate } from "../places/placeTypes";

const elementSchema = z.object({
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).optional(),
});

const responseSchema = z.object({
  elements: z.array(elementSchema),
});

const toCandidate = (element: z.infer<typeof elementSchema>, cityHint?: string, countryHint?: string): PlaceCandidate | null => {
  const name = element.tags?.name?.trim();
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!name || lat === undefined || lon === undefined) {
    return null;
  }
  const cuisine = element.tags?.cuisine;
  const cats = ["amenity:restaurant", ...(cuisine ? [`cuisine:${cuisine}`] : [])];
  return {
    id: `osm:${element.id}`,
    provider: "osm",
    providerId: String(element.id),
    name,
    city: element.tags?.["addr:city"] ?? cityHint,
    country: element.tags?.["addr:country"] ?? countryHint,
    coordinates: { lat, lng: lon },
    categories: cats,
  };
};

const nameMatchesQuery = (name: string, query: string): boolean => {
  const n = name.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) {
    return false;
  }
  if (n.includes(q)) {
    return true;
  }
  const parts = q.split(/\s+/).filter((p) => p.length >= 2);
  return parts.length > 0 && parts.every((p) => n.includes(p));
};

export const searchRestaurantsForFoodPreferences = async (ctx: {
  query: string;
  city?: string;
  country?: string;
  limit?: number;
}): Promise<PlaceCandidate[]> => {
  const q = ctx.query.trim();
  if (q.length < 2) {
    return [];
  }
  const label = [ctx.city, ctx.country].filter(Boolean).join(", ");
  if (!label.trim()) {
    return [];
  }
  const limit = Math.min(Math.max(ctx.limit ?? 12, 1), 18);

  let lat: number;
  let lon: number;
  try {
    const geo = await publicGeoProvider.geocode(label);
    lat = geo.latitude;
    lon = geo.longitude;
  } catch {
    return [];
  }

  const body = [
    "[out:json][timeout:22];(",
    `node["amenity"="restaurant"](around:5200,${lat},${lon});`,
    `way["amenity"="restaurant"](around:5200,${lat},${lon});`,
    `node["amenity"="fast_food"](around:5200,${lat},${lon});`,
    `way["amenity"="fast_food"](around:5200,${lat},${lon});`,
    ");out center tags 24;",
  ].join("");

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: body }),
    });
    if (!response.ok) {
      return [];
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return [];
    }

    const candidates: PlaceCandidate[] = [];
    for (const el of parsed.data.elements) {
      const c = toCandidate(el, ctx.city?.trim(), ctx.country?.trim());
      if (c && nameMatchesQuery(c.name, q)) {
        candidates.push(c);
      }
    }

    const seen = new Set<string>();
    const deduped: PlaceCandidate[] = [];
    for (const c of candidates) {
      const key = c.providerId;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(c);
      if (deduped.length >= limit) {
        break;
      }
    }
    return deduped;
  } catch {
    return [];
  }
};
