import type { CitySearchResult } from "./contracts";
import { publicGeoProvider } from "./publicGeoProvider";

export const citySearchProvider = {
  searchCities: async (query: string, limit = 6): Promise<CitySearchResult[]> => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      return [];
    }

    return publicGeoProvider.searchCities(normalizedQuery, { limit });
  },
};
