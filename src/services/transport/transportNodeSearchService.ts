import { z } from "zod";
import { publicGeoProvider } from "../providers/publicGeoProvider";
import type { PlaceCandidate } from "../places/placeTypes";
import type { TransportNode, TransportNodeType } from "./transportNodeTypes";

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

const inferNodeType = (tags: Record<string, string> | undefined): TransportNodeType => {
  if (!tags) {
    return "train";
  }
  if (tags.amenity === "ferry_terminal" || tags.route === "ferry" || tags.harbour || tags.man_made === "pier") {
    return "ferry";
  }
  if (tags.amenity === "bus_station" || tags.bus === "yes") {
    return "bus";
  }
  if (tags.railway === "subway_entrance" || tags.station === "subway" || tags.public_transport === "station") {
    const name = (tags.name ?? "").toLowerCase();
    if (name.includes("metro") || tags.subway === "yes") {
      return "metro";
    }
  }
  if (tags.railway === "station" || tags.public_transport === "station") {
    return "train";
  }
  return "train";
};

const categoryTags = (type: TransportNodeType, tags: Record<string, string> | undefined): string[] => {
  const raw = [
    type,
    tags?.railway,
    tags?.amenity,
    tags?.public_transport,
    tags?.harbour,
    tags?.route,
  ].filter(Boolean) as string[];
  return [...new Set(raw.map(String))];
};

const toPlaceCandidate = (
  element: z.infer<typeof elementSchema>,
  type: TransportNodeType,
  cityHint?: string,
  countryHint?: string,
): PlaceCandidate | null => {
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
    categories: categoryTags(type, element.tags),
  };
};

const nameMatches = (name: string, query: string): boolean => {
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

export type TransportNodeSearchInput = {
  query: string;
  city?: string;
  country?: string;
  limit?: number;
};

/**
 * Public-map search for major movement hubs (no plain-text-only substitute for routing).
 * Uses Overpass around the geocoded city; filters client-side by name.
 */
export const searchTransportNodes = async (input: TransportNodeSearchInput): Promise<TransportNode[]> => {
  const q = input.query.trim();
  if (q.length < 2) {
    return [];
  }
  const label = [input.city, input.country].filter(Boolean).join(", ");
  if (!label.trim()) {
    return [];
  }
  const limit = Math.min(Math.max(input.limit ?? 14, 1), 22);

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
    "[out:json][timeout:24];(",
    `node[railway=station](around:9500,${lat},${lon});`,
    `way[railway=station](around:9500,${lat},${lon});`,
    `node[public_transport=station](around:9500,${lat},${lon});`,
    `node[amenity=bus_station](around:9500,${lat},${lon});`,
    `way[amenity=bus_station](around:9500,${lat},${lon});`,
    `node[amenity=ferry_terminal](around:9500,${lat},${lon});`,
    `way[amenity=ferry_terminal](around:9500,${lat},${lon});`,
    `node[harbour](around:9500,${lat},${lon});`,
    `way[harbour](around:9500,${lat},${lon});`,
    `node[railway=subway_entrance](around:9500,${lat},${lon});`,
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

    const out: TransportNode[] = [];
    const seen = new Set<string>();
    for (const el of parsed.data.elements) {
      const type = inferNodeType(el.tags);
      const place = toPlaceCandidate(el, type, input.city?.trim(), input.country?.trim());
      if (!place || !nameMatches(place.name, q)) {
        continue;
      }
      const key = place.providerId;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ type, place });
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  } catch {
    return [];
  }
};
