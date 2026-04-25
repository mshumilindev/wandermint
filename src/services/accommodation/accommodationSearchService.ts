import { deduplicateAccommodations } from "./accommodationDeduplicationService";
import { accommodationProviderOrder } from "./accommodationProviderRegistry";
import type { AccommodationCandidate, AccommodationSearchContext } from "./accommodationTypes";

type CacheEntry = { storedAt: number; rows: AccommodationCandidate[] };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

const cacheKey = (ctx: AccommodationSearchContext): string =>
  [
    ctx.query.trim().toLowerCase(),
    (ctx.city ?? "").toLowerCase(),
    (ctx.country ?? "").toLowerCase(),
    ctx.dateRange?.start ?? "",
    ctx.dateRange?.end ?? "",
  ].join("|");

const rankCandidates = (ctx: AccommodationSearchContext, rows: AccommodationCandidate[]): AccommodationCandidate[] => {
  const q = ctx.query.trim().toLowerCase();
  const cityNeedle = (ctx.city ?? "").toLowerCase();
  return [...rows].sort((a, b) => {
    const aName = a.name.toLowerCase().includes(q) ? 1 : 0;
    const bName = b.name.toLowerCase().includes(q) ? 1 : 0;
    if (bName !== aName) {
      return bName - aName;
    }
    const aCity = (a.city ?? "").toLowerCase() === cityNeedle ? 1 : 0;
    const bCity = (b.city ?? "").toLowerCase() === cityNeedle ? 1 : 0;
    if (bCity !== aCity) {
      return bCity - aCity;
    }
    const aGeo = a.coordinates ? 1 : 0;
    const bGeo = b.coordinates ? 1 : 0;
    if (bGeo !== aGeo) {
      return bGeo - aGeo;
    }
    const aImg = a.imageUrl ? 1 : 0;
    const bImg = b.imageUrl ? 1 : 0;
    if (bImg !== aImg) {
      return bImg - aImg;
    }
    const aProv = (a.mergedFromProviders?.length ?? 0) + (a.provider === "booking_demand" ? 2 : a.provider === "amadeus" ? 1 : 0);
    const bProv = (b.mergedFromProviders?.length ?? 0) + (b.provider === "booking_demand" ? 2 : b.provider === "amadeus" ? 1 : 0);
    if (bProv !== aProv) {
      return bProv - aProv;
    }
    return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
  });
};

export const searchAccommodations = async (ctx: AccommodationSearchContext): Promise<AccommodationCandidate[]> => {
  const key = cacheKey(ctx);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAt < CACHE_TTL_MS) {
    return hit.rows;
  }

  const batches = await Promise.all(accommodationProviderOrder.map((p) => p.fn(ctx).catch(() => [] as AccommodationCandidate[])));
  const flat = batches.flat();
  const deduped = deduplicateAccommodations(flat);
  const ranked = rankCandidates(ctx, deduped).slice(0, 40);
  cache.set(key, { storedAt: Date.now(), rows: ranked });
  return ranked;
};
