import type { CountryMeta } from "./countryMetaProvider";
import { relativePriceIndex } from "./worldBankPriceLevelProvider";
import type { LocalTransportEstimate } from "../types/pricing.types";

const nowIso = (): string => new Date().toISOString();

/**
 * Conservative multi-day local transit + occasional taxi band, scaled by PPP vs home when available.
 * Not a timetable — mark confidence accordingly.
 */
export const estimateLocalTransport = async (params: {
  destinationLabel: string;
  destinationCountryMeta: CountryMeta | null;
  originCountryMeta: CountryMeta | null;
  userCurrency: string;
  durationDays: number;
  userAvgDailySpend: number | null;
}): Promise<LocalTransportEstimate> => {
  if (!params.userAvgDailySpend || params.userAvgDailySpend <= 0) {
    return {
      provider: "none",
      destination: params.destinationLabel,
      currency: params.userCurrency,
      totalMin: 0,
      totalMax: 0,
      assumptions: ["Needs historical trip spend to allocate a local-transit envelope."],
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
      assumptions: [
        "Local transport estimate needs a World Bank PPP ratio between home and destination countries.",
        "Check city transit passes when dates are fixed.",
      ],
      confidence: "unavailable",
      fetchedAt: nowIso(),
    };
  }

  const basePerDay = params.userAvgDailySpend * 0.1;
  const daily = basePerDay * ratio;
  const totalMin = Math.round(daily * 0.75 * params.durationDays);
  const totalMax = Math.round(daily * 1.45 * params.durationDays);

  return {
    provider: "ppp_scaled_proxy",
    sourceUrl: "https://data.worldbank.org/indicator/PA.NUS.PRVT.PP",
    destination: params.destinationLabel,
    currency: params.userCurrency,
    totalMin,
    totalMax,
    assumptions: [
      "Envelope = ~10% of your historical daily trip spend × PPP vs home (not pass/timetable pricing).",
      "Public transit + short rides; verify passes when dates are fixed.",
    ],
    confidence: "low",
    fetchedAt: nowIso(),
  };
};
