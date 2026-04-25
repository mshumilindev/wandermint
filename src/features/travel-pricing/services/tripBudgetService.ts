import { estimateActivityCosts } from "../providers/activitiesCostProvider";
import { estimateFoodBudget } from "../providers/foodCostProvider";
import { fetchAccommodationQuote } from "../providers/hotelsPriceProvider";
import { fetchTransportPriceQuote } from "../providers/flightsPriceProvider";
import { estimateLocalTransport } from "../providers/localTransportProvider";
import type { CountryMeta } from "../providers/countryMetaProvider";
import type { BudgetCategory, BudgetCategoryConfidence, BudgetSource, TripBudgetBreakdown } from "../types/tripBudget.types";
import { convertAmount } from "./currencyExchangeService";
import { rollupBudgetConfidence } from "./sourceConfidenceService";

export type BuildTripBudgetParams = {
  originLabel: string;
  originCountryMeta: CountryMeta | null;
  destinationCity: string;
  destinationCountry: string;
  destinationCountryMeta: CountryMeta | null;
  destinationLabel: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  userCurrency: string;
  userAvgDailySpend: number | null;
  foodStyle: "budget" | "balanced" | "foodie" | "premium";
};

const nowIso = (): string => new Date().toISOString();

const BUDGET_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const budgetCache = new Map<string, { expiresAt: number; value: TripBudgetBreakdown }>();

const budgetCacheKey = (p: BuildTripBudgetParams): string =>
  [
    p.destinationCity,
    p.destinationCountry,
    p.startDate,
    p.endDate,
    p.userCurrency,
    String(p.userAvgDailySpend ?? ""),
    p.foodStyle,
  ].join("|");

const emptyCategory = (label: string, currency: string, confidence: BudgetCategoryConfidence): BudgetCategory => ({
  label,
  min: 0,
  max: 0,
  currency,
  confidence,
  assumptions: confidence === "unavailable" ? ["No source-backed estimate for this category."] : [],
});

const toUserCurrency = async (amount: number, from: string, to: string): Promise<number> => {
  if (amount <= 0) {
    return 0;
  }
  try {
    return await convertAmount(amount, from, to);
  } catch {
    return amount;
  }
};

const mapCategory = async (params: {
  label: string;
  min: number;
  max: number;
  fromCurrency: string;
  toCurrency: string;
  confidence: BudgetCategoryConfidence;
  sourceUrls?: string[];
  assumptions?: string[];
}): Promise<BudgetCategory> => {
  const min = await toUserCurrency(params.min, params.fromCurrency, params.toCurrency);
  const max = await toUserCurrency(Math.max(params.max, params.min), params.fromCurrency, params.toCurrency);
  return {
    label: params.label,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    currency: params.toCurrency,
    confidence: params.confidence,
    sourceUrls: params.sourceUrls,
    assumptions: params.assumptions,
  };
};

export const buildTripBudgetBreakdown = async (params: BuildTripBudgetParams): Promise<TripBudgetBreakdown> => {
  const ck = budgetCacheKey(params);
  const hit = budgetCache.get(ck);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const results = await Promise.allSettled([
    fetchTransportPriceQuote({
      originLabel: params.originLabel,
      destinationCity: params.destinationCity,
      destinationCountry: params.destinationCountry,
      departureDate: params.startDate,
      returnDate: params.endDate,
      currency: params.userCurrency,
    }),
    fetchAccommodationQuote({
      city: params.destinationCity,
      country: params.destinationCountry,
      checkIn: params.startDate,
      checkOut: params.endDate,
      currency: params.userCurrency,
    }),
    estimateFoodBudget({
      destinationLabel: params.destinationLabel,
      destinationCountryMeta: params.destinationCountryMeta,
      originCountryMeta: params.originCountryMeta,
      userCurrency: params.userCurrency,
      userAvgDailySpend: params.userAvgDailySpend,
      durationDays: params.durationDays,
      foodStyle: params.foodStyle,
    }),
    estimateLocalTransport({
      destinationLabel: params.destinationLabel,
      destinationCountryMeta: params.destinationCountryMeta,
      originCountryMeta: params.originCountryMeta,
      userCurrency: params.userCurrency,
      durationDays: params.durationDays,
      userAvgDailySpend: params.userAvgDailySpend,
    }),
    estimateActivityCosts({
      destinationLabel: params.destinationLabel,
      destinationCountryMeta: params.destinationCountryMeta,
      originCountryMeta: params.originCountryMeta,
      userCurrency: params.userCurrency,
      durationDays: params.durationDays,
      userAvgDailySpend: params.userAvgDailySpend,
    }),
  ]);

  const transport = results[0].status === "fulfilled" ? results[0].value : null;
  const hotel = results[1].status === "fulfilled" ? results[1].value : null;
  const food = results[2].status === "fulfilled" ? results[2].value : null;
  const local = results[3].status === "fulfilled" ? results[3].value : null;
  const acts = results[4].status === "fulfilled" ? results[4].value : null;

  const sources: BudgetSource[] = [];
  const assumptions: string[] = [];

  const transportCat: BudgetCategory =
    transport && transport.confidence !== "unavailable" && transport.minPrice > 0
      ? await mapCategory({
          label: "Flights / long-distance transport",
          min: transport.minPrice,
          max: transport.maxPrice ?? transport.minPrice,
          fromCurrency: transport.currency,
          toCurrency: params.userCurrency,
          confidence: transport.confidence === "high" ? "high" : "medium",
          sourceUrls: transport.sourceUrl ? [transport.sourceUrl] : [],
          assumptions: ["From configured transport quote proxy when available."],
        })
      : emptyCategory("Flights / long-distance transport", params.userCurrency, "unavailable");

  if (transport && transport.confidence !== "unavailable") {
    sources.push({
      category: "transport",
      provider: transport.provider,
      url: transport.sourceUrl,
      fetchedAt: transport.fetchedAt,
      confidence: transport.confidence,
    });
  } else {
    assumptions.push("Transport fares: no live quote — configure VITE_TRIP_TRANSPORT_QUOTE_URL or check airline/rail sites.");
  }

  const hotelCurrency = hotel?.currency ?? params.userCurrency;
  const hotelMax = hotel?.totalMax ?? 0;
  const hotelMin = hotel?.totalMin ?? 0;
  const hotelCat: BudgetCategory =
    hotel && hotel.confidence !== "unavailable" && hotelMax > 0
      ? await mapCategory({
          label: "Hotel / accommodation",
          min: hotelMin,
          max: hotelMax,
          fromCurrency: hotelCurrency,
          toCurrency: params.userCurrency,
          confidence: hotel.confidence,
          sourceUrls: hotel.sourceUrl ? [hotel.sourceUrl] : [],
          assumptions: [`Sample size ${hotel.sampleSize ?? 0} priced listings (when numeric rates exist).`],
        })
      : emptyCategory("Hotel / accommodation", params.userCurrency, "unavailable");

  if (hotel && hotel.confidence !== "unavailable") {
    sources.push({
      category: "accommodation",
      provider: hotel.provider,
      url: hotel.sourceUrl,
      fetchedAt: hotel.fetchedAt,
      confidence: hotel.confidence,
    });
  } else {
    assumptions.push("Hotels: listings without published nightly rates were excluded (no guessing).");
  }

  const foodCat: BudgetCategory =
    food && food.confidence !== "unavailable" && food.totalMax > 0
      ? await mapCategory({
          label: "Food",
          min: food.totalMin,
          max: food.totalMax,
          fromCurrency: food.currency,
          toCurrency: params.userCurrency,
          confidence: food.confidence,
          sourceUrls: food.sourceUrl ? [food.sourceUrl] : [],
          assumptions: food.assumptions,
        })
      : emptyCategory("Food", params.userCurrency, "unavailable");

  if (food && food.confidence !== "unavailable") {
    sources.push({
      category: "food",
      provider: food.provider,
      url: food.sourceUrl,
      fetchedAt: food.fetchedAt,
      confidence: food.confidence,
    });
  }

  const localCat: BudgetCategory =
    local && local.confidence !== "unavailable" && local.totalMax > 0
      ? await mapCategory({
          label: "Local transport",
          min: local.totalMin,
          max: local.totalMax,
          fromCurrency: local.currency,
          toCurrency: params.userCurrency,
          confidence: local.confidence,
          sourceUrls: local.sourceUrl ? [local.sourceUrl] : [],
          assumptions: local.assumptions,
        })
      : emptyCategory("Local transport", params.userCurrency, "unavailable");

  if (local && local.confidence !== "unavailable") {
    sources.push({
      category: "localTransport",
      provider: local.provider,
      url: local.sourceUrl,
      fetchedAt: local.fetchedAt,
      confidence: local.confidence,
    });
  }

  const actCat: BudgetCategory =
    acts && acts.confidence !== "unavailable" && acts.totalMax > 0
      ? await mapCategory({
          label: "Activities / entertainment",
          min: acts.totalMin,
          max: acts.totalMax,
          fromCurrency: acts.currency,
          toCurrency: params.userCurrency,
          confidence: acts.confidence,
          assumptions: ["Envelope from your historical spend mix × PPP — verify ticket prices."],
        })
      : emptyCategory("Activities / entertainment", params.userCurrency, "unavailable");

  if (acts && acts.confidence !== "unavailable") {
    sources.push({
      category: "activities",
      provider: acts.provider,
      fetchedAt: acts.fetchedAt,
      confidence: acts.confidence,
    });
  }

  const cats = [transportCat, hotelCat, foodCat, localCat, actCat];
  const usable = cats.filter((c) => c.confidence !== "unavailable" && c.max > 0);
  const subMin = usable.reduce((s, c) => s + c.min, 0);
  const subMax = usable.reduce((s, c) => s + c.max, 0);

  const unavailableCount = cats.filter((c) => c.confidence === "unavailable" || c.max <= 0).length;
  const bufferRate = 0.08 + Math.min(0.07, unavailableCount * 0.03);
  const bufferMin = subMin > 0 ? Math.round(subMin * bufferRate) : 0;
  const bufferMax = subMax > 0 ? Math.round(subMax * (bufferRate + 0.04)) : 0;

  const bufferCat: BudgetCategory = {
    label: "Buffer / unexpected",
    min: bufferMin,
    max: bufferMax,
    currency: params.userCurrency,
    confidence: unavailableCount > 2 ? "low" : subMin > 0 ? "medium" : "unavailable",
    assumptions: [`${Math.round(bufferRate * 100)}–${Math.round((bufferRate + 0.04) * 100)}% of subtotal because ${unavailableCount} major categories lacked live quotes.`],
  };

  const totalMin = subMin + bufferMin;
  const totalMax = subMax + bufferMax;

  const rollup = rollupBudgetConfidence([
    transportCat.confidence,
    hotelCat.confidence,
    foodCat.confidence,
    localCat.confidence,
    actCat.confidence,
    bufferCat.confidence,
  ]);

  const value: TripBudgetBreakdown = {
    currency: params.userCurrency,
    totalMin,
    totalMax,
    categories: {
      transport: transportCat,
      accommodation: hotelCat,
      food: foodCat,
      localTransport: localCat,
      activities: actCat,
      buffer: bufferCat,
    },
    confidence: usable.length === 0 ? "low" : rollup,
    sources,
    assumptions,
    fetchedAt: nowIso(),
  };
  budgetCache.set(ck, { value, expiresAt: Date.now() + BUDGET_CACHE_TTL_MS });
  return value;
};
