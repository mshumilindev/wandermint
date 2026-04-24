import { z } from "zod";
import type { CitySearchResult, GeoPoint, GeocodingProvider } from "./contracts";

const nominatimItemSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  class: z.string().optional(),
  type: z.string().optional(),
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      municipality: z.string().optional(),
      county: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

const nominatimListSchema = z.array(nominatimItemSchema);

const reverseGeocodeSchema = z.object({
  display_name: z.string().optional(),
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      municipality: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

const parseCoordinateLabel = (locationLabel: string): GeoPoint | null => {
  const parts = locationLabel.split(",").map((part) => Number(part.trim()));
  const latitude = parts[0];
  const longitude = parts[1];

  if (parts.length < 2 || latitude === undefined || longitude === undefined || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
  };
};

const cityFromAddress = (address?: {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
}): string | undefined =>
  address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? address?.county;

const toCitySearchResults = (items: z.infer<typeof nominatimListSchema>): CitySearchResult[] => {
  const dedupe = new Set<string>();
  const results: CitySearchResult[] = [];

  items.forEach((item) => {
    const fallbackName = item.display_name.split(",")[0]?.trim();
    const city = cityFromAddress(item.address) ?? fallbackName;
    const country = item.address?.country;
    if (!city || !country) {
      return;
    }

    const key = `${city.trim().toLowerCase()}|${country.trim().toLowerCase()}`;
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);

    results.push({
      city: city.trim(),
      country: country.trim(),
      region: item.address?.state ?? item.address?.county,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      label: `${city.trim()}, ${country.trim()}`,
    });
  });

  return results;
};

export const publicGeoProvider: GeocodingProvider = {
  geocode: async (locationLabel) => {
    const coordinatePoint = parseCoordinateLabel(locationLabel);
    if (coordinatePoint) {
      return coordinatePoint;
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", locationLabel);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Could not geocode location");
    }

    const result = nominatimListSchema.parse(await response.json());
    const first = result[0];
    if (!first) {
      throw new Error("No geocoding result found");
    }

    return {
      latitude: Number(first.lat),
      longitude: Number(first.lon),
      label: first.display_name.split(",").slice(0, 2).join(","),
    };
  },

  reverseGeocode: async (latitude, longitude) => {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));

    const response = await fetch(url);
    if (!response.ok) {
      return { latitude, longitude, label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
    }

    const result = reverseGeocodeSchema.parse(await response.json());
    const city = result.address?.city ?? result.address?.town ?? result.address?.village ?? result.address?.municipality;
    const label = [city, result.address?.country].filter(Boolean).join(", ") || result.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    return { latitude, longitude, label };
  },

  searchCities: async (query, options) => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      return [];
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(options?.limit ?? 6));
    url.searchParams.set("q", normalizedQuery);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Could not search cities");
    }

    return toCitySearchResults(nominatimListSchema.parse(await response.json()));
  },
};
