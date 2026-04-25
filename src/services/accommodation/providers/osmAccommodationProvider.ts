import { z } from "zod";
import { nowIso } from "../../firebase/timestampMapper";
import { publicGeoProvider } from "../../providers/publicGeoProvider";
import type { AccommodationCandidate } from "../accommodationTypes";
import type { AccommodationSearchContext } from "../accommodationTypes";

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

const toCandidate = (element: z.infer<typeof elementSchema>, query: string): AccommodationCandidate | null => {
  const name = element.tags?.name?.trim();
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!name || lat === undefined || lon === undefined) {
    return null;
  }
  const street = element.tags?.["addr:street"];
  const city = element.tags?.["addr:city"];
  const country = element.tags?.["addr:country"];
  const q = query.toLowerCase();
  const nameMatch = name.toLowerCase().includes(q) ? 0.35 : 0.05;
  return {
    id: `osm:${element.id}`,
    provider: "openstreetmap",
    providerId: String(element.id),
    name,
    city,
    country,
    address: street,
    coordinates: { lat, lng: lon },
    categories: ["hotel", ...(element.tags?.tourism ? [element.tags.tourism] : [])],
    sourceUpdatedAt: nowIso(),
    relevanceScore: 0.55 + nameMatch,
  };
};

export const searchOsmAccommodations = async (ctx: AccommodationSearchContext): Promise<AccommodationCandidate[]> => {
  const q = ctx.query.trim();
  if (q.length < 2) {
    return [];
  }
  const label = [ctx.city, ctx.country].filter(Boolean).join(", ");
  if (!label.trim()) {
    return [];
  }
  const geo =
    ctx.coordinates !== undefined
      ? { lat: ctx.coordinates.lat, lon: ctx.coordinates.lng }
      : await publicGeoProvider.geocode(label).then((p) => ({ lat: p.latitude, lon: p.longitude }));
  const lat = geo.lat;
  const lon = geo.lon;
  const body = [
    `[out:json][timeout:20];(`,
    `node["tourism"="hotel"](around:4200,${lat},${lon});`,
    `way["tourism"="hotel"](around:4200,${lat},${lon});`,
    `node["tourism"="guest_house"](around:4200,${lat},${lon});`,
    `way["tourism"="guest_house"](around:4200,${lat},${lon});`,
    `);out center tags 24;`,
  ].join("");

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
  const out: AccommodationCandidate[] = [];
  for (const el of parsed.data.elements) {
    const c = toCandidate(el, q);
    if (c) {
      out.push(c);
    }
  }
  return out.slice(0, 24);
};
