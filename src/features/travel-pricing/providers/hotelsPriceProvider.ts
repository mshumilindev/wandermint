import { searchAccommodations } from "../../../services/accommodation/accommodationSearchService";
import type { AccommodationQuote } from "../types/pricing.types";

const nowIso = (): string => new Date().toISOString();

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Uses existing accommodation providers (OSM, static). Nightly totals are only emitted when
 * candidates expose numeric `estimatedPrice` with currency — otherwise unavailable (no guessing).
 */
export const fetchAccommodationQuote = async (params: {
  city: string;
  country: string;
  checkIn: string;
  checkOut: string;
  currency: string;
}): Promise<AccommodationQuote> => {
  const rows = await searchAccommodations({
    query: "hotel",
    city: params.city,
    country: params.country,
    dateRange: { start: params.checkIn, end: params.checkOut },
    adults: 2,
    rooms: 1,
  });

  const priced = rows.filter((r) => {
    const ep = r.estimatedPrice;
    if (!ep || ep.certainty === "unknown") {
      return false;
    }
    const min = toNumber(ep.min);
    const max = toNumber(ep.max);
    return min !== null && max !== null && min > 0 && max > 0;
  });

  if (priced.length === 0) {
    return {
      provider: "openstreetmap+registry",
      sourceUrl: "https://wiki.openstreetmap.org/wiki/Key:tourism",
      destination: `${params.city}, ${params.country}`,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      currency: params.currency,
      nightlyMin: 0,
      totalMin: 0,
      totalMax: 0,
      sampleSize: 0,
      confidence: "unavailable",
      fetchedAt: nowIso(),
    };
  }

  const nights = Math.max(1, Math.round((new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / 86400000));
  const nightlyValues: number[] = [];
  const totals: number[] = [];
  const options: NonNullable<AccommodationQuote["options"]> = [];

  for (const c of priced.slice(0, 8)) {
    const ep = c.estimatedPrice!;
    const min = toNumber(ep.min)!;
    const max = toNumber(ep.max)!;
    const cur = (ep.currency ?? params.currency).toUpperCase();
    const nightly = (min + max) / 2;
    nightlyValues.push(nightly);
    totals.push(nightly * nights);
    options.push({
      name: c.name,
      type: "hotel",
      nightlyPrice: Math.round(nightly * 100) / 100,
      totalPrice: Math.round(nightly * nights * 100) / 100,
      currency: cur,
      url: c.url,
    });
  }

  const nightlyMin = Math.min(...nightlyValues);
  const nightlyMax = Math.max(...nightlyValues);
  const totalMin = Math.min(...totals);
  const totalMax = Math.max(...totals);

  return {
    provider: priced[0]!.provider,
    destination: `${params.city}, ${params.country}`,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    currency: params.currency,
    nightlyMin: Math.round(nightlyMin * 100) / 100,
    nightlyMax: Math.round(nightlyMax * 100) / 100,
    totalMin: Math.round(totalMin * 100) / 100,
    totalMax: Math.round(totalMax * 100) / 100,
    sampleSize: priced.length,
    options,
    confidence: priced[0]!.estimatedPrice?.certainty === "exact" ? "high" : "medium",
    fetchedAt: nowIso(),
  };
};
