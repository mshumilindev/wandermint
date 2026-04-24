import { z } from "zod";
import type { PlaceSnapshot } from "../../entities/activity/model";
import { nowIso } from "../firebase/timestampMapper";
import type { PlacesProvider } from "./contracts";
import { buildOverpassSelectors, resolveInternalPlaceCategories, type InternalPlaceCategory } from "./placeCategoryMapping";
import { publicGeoProvider } from "./publicGeoProvider";

const overpassElementSchema = z.object({
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).optional(),
});

const overpassResponseSchema = z.object({
  elements: z.array(overpassElementSchema),
});

interface RankedCandidate {
  place: PlaceSnapshot;
  score: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const distanceMeters = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalize = (value: string): string => value.trim().toLowerCase();

const tokenize = (value: string | undefined): string[] =>
  (value ?? "")
    .split(/[;,]/)
    .map((item) => normalize(item))
    .filter(Boolean);

const scoreForCategory = (category: InternalPlaceCategory, tags: Record<string, string> | undefined, query: string): number => {
  const normalizedQuery = normalize(query);
  const cuisineTokens = tokenize(tags?.cuisine);
  let score = 0;

  if (category === "local_food" || category === "restaurant") {
    if (cuisineTokens.length > 0) {
      score += 18;
    }

    // Cuisine is one of the few grounded hints that the place is actually food-led rather than a generic amenity.
    if (cuisineTokens.some((token) => normalizedQuery.includes(token) || token.includes(normalizedQuery))) {
      score += 8;
    }
  }

  if (category === "traditional_drinks" || category === "nightlife") {
    if (tags?.amenity === "bar" || tags?.amenity === "pub" || tags?.amenity === "biergarten" || tags?.amenity === "nightclub") {
      score += 16;
    }
    if ((tags?.amenity === "cafe") && (normalizedQuery.includes("tea") || normalizedQuery.includes("coffee") || normalizedQuery.includes("matcha"))) {
      score += 10;
    }
  }

  if (category === "cinema" && tags?.amenity === "cinema") {
    score += 16;
  }

  if (category === "museum" && tags?.tourism === "museum") {
    score += 14;
  }

  if (category === "gallery" && (tags?.tourism === "gallery" || tags?.amenity === "arts_centre")) {
    score += 14;
  }

  if (category === "viewpoint" && tags?.tourism === "viewpoint") {
    score += 14;
  }

  if (category === "park" && (tags?.leisure === "park" || tags?.leisure === "garden")) {
    score += 14;
  }

  if (category === "landmark" && (tags?.tourism === "attraction" || typeof tags?.historic === "string")) {
    score += 12;
  }

  return score;
};

export const publicPlacesProvider: PlacesProvider = {
  searchPlaces: async (input) => {
    const point = input.latitude !== undefined && input.longitude !== undefined
      ? { latitude: input.latitude, longitude: input.longitude, label: input.locationLabel }
      : await publicGeoProvider.geocode(input.locationLabel);

    const internalCategories = resolveInternalPlaceCategories(input.categories, input.query);
    const selectors = buildOverpassSelectors(internalCategories);
    const radiusMeters = input.radiusMeters ?? 2400;
    const queryBody = selectors.map((selector) => `${selector}(around:${radiusMeters},${point.latitude},${point.longitude});`).join("");
    const query = `[out:json][timeout:18];(${queryBody});out center tags 24;`;

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }),
    });

    if (!response.ok) {
      throw new Error("Places provider failed");
    }

    const parsed = overpassResponseSchema.parse(await response.json());
    const seenNames = new Set<string>();
    const rankedCandidates = parsed.elements
      .map((element): RankedCandidate | null => {
        const name = element.tags?.name;
        const latitude = element.lat ?? element.center?.lat;
        const longitude = element.lon ?? element.center?.lon;
        if (!name || latitude === undefined || longitude === undefined) {
          return null;
        }

        const normalizedName = normalize(name);
        if (seenNames.has(normalizedName)) {
          return null;
        }
        seenNames.add(normalizedName);

        const place: PlaceSnapshot = {
          provider: "openstreetmap-overpass",
          providerPlaceId: String(element.id),
          name,
          address: element.tags?.["addr:street"],
          city: element.tags?.["addr:city"] ?? point.label.split(",")[0]?.trim(),
          country: element.tags?.["addr:country"] ?? point.label.split(",")[1]?.trim(),
          latitude,
          longitude,
          openingHoursLabel: element.tags?.opening_hours,
          capturedAt: nowIso(),
        };

        const distance = distanceMeters(point, { latitude, longitude });
        const score =
          1000 -
          distance / 20 +
          (name.trim().length > 0 ? 25 : 0) +
          (element.tags?.opening_hours ? 18 : 0) +
          internalCategories.reduce((sum, category) => sum + scoreForCategory(category, element.tags, input.query), 0);

        return {
          place,
          score,
        };
      })
      .filter((candidate): candidate is RankedCandidate => candidate !== null)
      .sort((left, right) =>
        right.score - left.score ||
        left.place.name.localeCompare(right.place.name) ||
        (left.place.providerPlaceId ?? "").localeCompare(right.place.providerPlaceId ?? ""),
      );

    if (rankedCandidates.length === 0) {
      throw new Error("No nearby places found");
    }

    return rankedCandidates.map((candidate) => candidate.place);
  },
};
