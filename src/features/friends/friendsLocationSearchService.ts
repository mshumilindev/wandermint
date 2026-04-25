import type { LocationSearchResult, SearchLocationsParams } from "../../entities/friend/model";
import { publicGeoProvider } from "../../services/providers/publicGeoProvider";

type NominatimItem = {
  place_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    country?: string;
  };
};

const cityFromAddress = (address: NominatimItem["address"]): string | undefined =>
  address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? address?.county;

const mapNominatimToResult = (item: NominatimItem): LocationSearchResult | null => {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  const city = cityFromAddress(item.address);
  if (!city) {
    return null;
  }
  return {
    id: item.place_id ? `nominatim:${item.place_id}` : `nominatim:${city}:${lat}:${lng}`,
    label: item.display_name ?? `${city}${item.address?.country ? `, ${item.address.country}` : ""}`,
    city,
    country: item.address?.country,
    address: item.display_name,
    coordinates: { lat, lng },
    provider: "nominatim",
  };
};

const fallbackMockResults = (query: string): LocationSearchResult[] => {
  const clean = query.trim();
  if (!clean) {
    return [];
  }
  return [
    {
      id: `mock:${clean}:1`,
      label: `${clean}, City Center`,
      city: clean,
      country: undefined,
      address: `${clean}, City Center`,
      coordinates: { lat: 0, lng: 0 },
      provider: "mock",
    },
  ];
};

export const friendsLocationSearchService = {
  searchLocations: async (params: SearchLocationsParams): Promise<LocationSearchResult[]> => {
    const query = params.query.trim();
    const limit = Math.max(1, Math.min(8, params.limit ?? 6));
    if (query.length < 2) {
      return [];
    }

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("q", query);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Location search provider unavailable.");
      }
      const raw = (await response.json()) as NominatimItem[];
      const normalized = raw.map(mapNominatimToResult).filter((row): row is LocationSearchResult => Boolean(row));
      if (normalized.length > 0) {
        return normalized.slice(0, limit);
      }
    } catch {
      // fall back below
    }

    try {
      const cities = await publicGeoProvider.searchCities(query, { limit });
      const normalized = cities.map((city) => ({
        id: `existing:${city.city}:${city.country}:${city.latitude}:${city.longitude}`,
        label: city.label,
        city: city.city,
        country: city.country,
        address: city.label,
        coordinates: { lat: city.latitude, lng: city.longitude },
        provider: "existing" as const,
      }));
      if (normalized.length > 0) {
        return normalized.slice(0, limit);
      }
    } catch {
      // fall back below
    }

    return fallbackMockResults(query).slice(0, limit);
  },
};
