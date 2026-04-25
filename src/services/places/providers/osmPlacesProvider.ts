import { z } from "zod";
import { publicGeoProvider } from "../../providers/publicGeoProvider";
import type { PlaceCandidate } from "../placeTypes";

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

const collectCategories = (tags: Record<string, string> | undefined): string[] => {
  if (!tags) {
    return [];
  }
  const out: string[] = [];
  if (tags.tourism) {
    out.push(`tourism:${tags.tourism}`);
  }
  if (tags.historic) {
    out.push(`historic:${tags.historic}`);
  }
  if (tags.amenity) {
    out.push(`amenity:${tags.amenity}`);
  }
  if (tags.leisure) {
    out.push(`leisure:${tags.leisure}`);
  }
  if (tags.natural) {
    out.push(`natural:${tags.natural}`);
  }
  return out.length > 0 ? out : ["place"];
};

const toCandidate = (element: z.infer<typeof elementSchema>, cityHint?: string, countryHint?: string): PlaceCandidate | null => {
  const name = element.tags?.name?.trim();
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!name || lat === undefined || lon === undefined) {
    return null;
  }
  return {
    id: `osm:${element.id}`,
    provider: "osm",
    providerId: String(element.id),
    name,
    city: element.tags?.["addr:city"] ?? cityHint,
    country: element.tags?.["addr:country"] ?? countryHint,
    coordinates: { lat, lng: lon },
    categories: collectCategories(element.tags),
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

/**
 * City-biased POI search via Overpass; results are filtered client-side by name
 * so the user query is never interpolated into the Overpass string.
 */
export const searchOsmPlaces = async (ctx: {
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
    `node["tourism"](around:5800,${lat},${lon});`,
    `way["tourism"](around:5800,${lat},${lon});`,
    `node["historic"](around:5800,${lat},${lon});`,
    `way["historic"](around:5800,${lat},${lon});`,
    `node["amenity"="place_of_worship"](around:5800,${lat},${lon});`,
    `way["amenity"="place_of_worship"](around:5800,${lat},${lon});`,
    `node["leisure"="park"](around:5800,${lat},${lon});`,
    `way["leisure"="park"](around:5800,${lat},${lon});`,
    ");out center tags 28;",
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
      const key = `${c.providerId}`;
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
