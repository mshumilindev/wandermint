import type { CountryMeta } from "./countryMetaProvider";
import { relativePriceIndex } from "./worldBankPriceLevelProvider";
import type { ActivityCostEstimate } from "../types/pricing.types";

const nowIso = (): string => new Date().toISOString();

/**
 * Activity envelope from PPP + duration — not venue ticket scraping.
 * Paid attractions should be verified before booking.
 */
export const estimateActivityCosts = async (params: {
  destinationLabel: string;
  destinationCountryMeta: CountryMeta | null;
  originCountryMeta: CountryMeta | null;
  userCurrency: string;
  durationDays: number;
  userAvgDailySpend: number | null;
}): Promise<ActivityCostEstimate> => {
  if (!params.userAvgDailySpend || params.userAvgDailySpend <= 0) {
    return {
      provider: "none",
      destination: params.destinationLabel,
      currency: params.userCurrency,
      totalMin: 0,
      totalMax: 0,
      items: [],
      confidence: "unavailable",
      fetchedAt: nowIso(),
    };
  }

  const ratio = await relativePriceIndex(params.originCountryMeta, params.destinationCountryMeta);
  if (ratio === null || !Number.isFinite(ratio)) {
    return {
      provider: "none",
      destination: params.destinationLabel,
      currency: params.userCurrency,
      totalMin: 0,
      totalMax: 0,
      items: [],
      confidence: "unavailable",
      fetchedAt: nowIso(),
    };
  }

  const perDay = params.userAvgDailySpend * 0.14 * ratio;
  const totalMin = Math.round(perDay * 0.55 * params.durationDays);
  const totalMax = Math.round(perDay * 1.35 * params.durationDays);

  return {
    provider: "ppp_activity_envelope",
    destination: params.destinationLabel,
    currency: params.userCurrency,
    totalMin,
    totalMax,
    items: [
      {
        name: "Paid + free mix (envelope from your spend history × PPP)",
        category: "mixed",
        priceMin: totalMin,
        priceMax: totalMax,
        currency: params.userCurrency,
      },
    ],
    confidence: "low",
    fetchedAt: nowIso(),
  };
};
