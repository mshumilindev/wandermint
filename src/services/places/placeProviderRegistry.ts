import type { PlaceCandidate } from "./placeTypes";
import { searchGooglePlaces } from "./providers/googlePlacesProvider";
import { searchOsmPlaces } from "./providers/osmPlacesProvider";

export type PlaceSearchContext = {
  query: string;
  city?: string;
  country?: string;
  limit?: number;
};

const candidateKey = (c: PlaceCandidate): string => `${c.provider}:${c.providerId}`;

/** Merges parallel provider results; first occurrence wins. */
export const mergePlaceCandidates = (groups: PlaceCandidate[][]): PlaceCandidate[] => {
  const seen = new Set<string>();
  const out: PlaceCandidate[] = [];
  for (const group of groups) {
    for (const c of group) {
      const key = candidateKey(c);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(c);
    }
  }
  return out;
};

export const searchAllRegisteredPlaceProviders = async (ctx: PlaceSearchContext): Promise<PlaceCandidate[]> => {
  const limit = ctx.limit ?? 12;
  const perProvider = Math.min(12, Math.max(4, limit));

  const [google, osm] = await Promise.all([
    searchGooglePlaces({ ...ctx, limit: perProvider }).catch(() => [] as PlaceCandidate[]),
    searchOsmPlaces({ ...ctx, limit: perProvider }).catch(() => [] as PlaceCandidate[]),
  ]);

  return mergePlaceCandidates([google, osm]).slice(0, limit);
};
