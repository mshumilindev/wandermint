import type { ActivityBlock, ActivityBlockType, CostRange, MovementMode, PlaceSnapshot } from "../../entities/activity/model";
import type { TripBudget } from "../../entities/trip/model";
import { fallbackPricingProfile, pricingProfiles, type PricingBandRanges, type PricingProfile } from "./pricingProfiles";

type PricingConfidence = "estimated" | "unknown";

interface PricingLookupInput {
  place?: PlaceSnapshot;
  locationLabel?: string;
  city?: string;
  country?: string;
}

interface ResolvedPricingProfile {
  profile: PricingProfile;
  certainty: PricingConfidence;
  city?: string;
  country?: string;
}

interface EstimateActivityCostInput extends PricingLookupInput {
  type: ActivityBlockType;
  category?: string;
  budgetStyle?: TripBudget["style"];
}

interface EstimateMovementCostInput extends PricingLookupInput {
  mode: MovementMode;
  distanceKm: number;
  budgetStyle?: TripBudget["style"];
}

const conversionToEur: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  PLN: 0.23,
  JPY: 0.0061,
  CZK: 0.04,
  GBP: 1.17,
};

const normalizeText = (value: string | undefined): string => value?.trim().toLowerCase() ?? "";

const tokenizeLocation = (value: string): string[] =>
  value
    .split(/[,\-|/]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);

const matchesProfile = (profile: PricingProfile, city: string, country: string, locationTokens: string[]): boolean => {
  const countryMatch = profile.countryMatchers.some((matcher) => country.includes(normalizeText(matcher)) || locationTokens.includes(normalizeText(matcher)));
  const cityMatchers = profile.cityMatchers ?? [];
  const cityMatch = cityMatchers.length === 0
    ? false
    : cityMatchers.some((matcher) => city.includes(normalizeText(matcher)) || locationTokens.includes(normalizeText(matcher)));

  return cityMatch || countryMatch;
};

const clampPair = (range: [number, number], multiplier = 1): [number, number] => {
  const min = Math.round(range[0] * multiplier);
  const max = Math.max(min, Math.round(range[1] * multiplier));
  return [min, max];
};

const chooseBand = (profile: PricingProfile, key: keyof PricingProfile, budgetStyle: TripBudget["style"]): [number, number] => {
  const ranges = profile[key] as PricingBandRanges;
  return ranges[budgetStyle];
};

const convertRange = (value: CostRange, targetCurrency: string): CostRange => {
  if (value.currency === targetCurrency) {
    return value;
  }

  const fromRate = conversionToEur[value.currency];
  const toRate = conversionToEur[targetCurrency];
  if (!fromRate || !toRate) {
    return { ...value, certainty: "unknown" };
  }

  const inEurMin = value.min * fromRate;
  const inEurMax = value.max * fromRate;
  return {
    min: Math.round(inEurMin / toRate),
    max: Math.max(Math.round(inEurMin / toRate), Math.round(inEurMax / toRate)),
    currency: targetCurrency,
    certainty: "estimated",
  };
};

const pickActivityBand = (type: ActivityBlockType, category: string): keyof PricingProfile => {
  const signature = `${type} ${category}`.toLowerCase();

  if (signature.includes("cinema")) {
    return "cinema";
  }
  if (signature.includes("drink") || signature.includes("bar") || signature.includes("cocktail") || signature.includes("pub")) {
    return "drinks";
  }
  if (
    signature.includes("meal") ||
    signature.includes("food") ||
    signature.includes("restaurant") ||
    signature.includes("breakfast") ||
    signature.includes("lunch") ||
    signature.includes("dinner")
  ) {
    return "meal";
  }
  if (signature.includes("cafe") || signature.includes("coffee")) {
    return "cafe";
  }
  if (signature.includes("museum")) {
    return "museum";
  }
  if (signature.includes("rest") || signature.includes("hotel") || signature.includes("check-in")) {
    return "rest";
  }
  if (signature.includes("transfer")) {
    return "localTransit";
  }

  return "attraction";
};

const addPlacePriceSignal = (range: [number, number], priceLevel: number | undefined): [number, number] => {
  if (priceLevel === undefined) {
    return range;
  }

  const multiplier = priceLevel >= 4 ? 1.35 : priceLevel === 3 ? 1.18 : priceLevel <= 1 ? 0.9 : 1;
  return clampPair(range, multiplier);
};

export const pricingService = {
  resolvePricingProfile: (input: PricingLookupInput): ResolvedPricingProfile => {
    const city = normalizeText(input.place?.city ?? input.city);
    const country = normalizeText(input.place?.country ?? input.country);
    const locationTokens = tokenizeLocation(input.locationLabel ?? "");
    const exactProfile = pricingProfiles.find((profile) => matchesProfile(profile, city, country, locationTokens));

    if (exactProfile) {
      return {
        profile: exactProfile,
        certainty: "estimated",
        city: input.place?.city ?? input.city,
        country: input.place?.country ?? input.country,
      };
    }

    return {
      profile: fallbackPricingProfile,
      certainty: "unknown",
      city: input.place?.city ?? input.city,
      country: input.place?.country ?? input.country,
    };
  },

  estimateActivityCost: ({ type, category = "", place, budgetStyle = "balanced", locationLabel, city, country }: EstimateActivityCostInput): CostRange => {
    const resolved = pricingService.resolvePricingProfile({ place, locationLabel, city, country });
    const bandKey = pickActivityBand(type, category);
    const rawRange = chooseBand(resolved.profile, bandKey, budgetStyle);
    const [min, max] = addPlacePriceSignal(rawRange, place?.priceLevel);

    if (type === "transfer" && min === 0 && max === 0) {
      return {
        min,
        max,
        currency: resolved.profile.currency,
        certainty: resolved.certainty,
      };
    }

    return {
      min,
      max,
      currency: resolved.profile.currency,
      certainty: resolved.certainty,
    };
  },

  estimateMovementCost: ({ mode, distanceKm, place, city, country, locationLabel, budgetStyle = "balanced" }: EstimateMovementCostInput): CostRange | undefined => {
    const resolved = pricingService.resolvePricingProfile({ place, city, country, locationLabel });
    const safeDistanceKm = Math.max(distanceKm, 0);

    if (mode === "walking") {
      return {
        min: 0,
        max: 0,
        currency: resolved.profile.currency,
        certainty: "exact",
      };
    }

    if (mode === "public_transport") {
      const [baseMin, baseMax] = chooseBand(resolved.profile, "localTransit", budgetStyle);
      const distanceFactor = safeDistanceKm > 12 ? 1.35 : safeDistanceKm > 6 ? 1.18 : 1;
      const [min, max] = clampPair([baseMin, baseMax], distanceFactor);
      return {
        min,
        max,
        currency: resolved.profile.currency,
        certainty: resolved.certainty,
      };
    }

    const [baseMin, baseMax] = chooseBand(resolved.profile, "taxiBase", budgetStyle);
    const [perKmMin, perKmMax] = chooseBand(resolved.profile, "taxiPerKm", budgetStyle);
    return {
      min: Math.round(baseMin + safeDistanceKm * perKmMin),
      max: Math.max(Math.round(baseMin + safeDistanceKm * perKmMin), Math.round(baseMax + safeDistanceKm * perKmMax)),
      currency: resolved.profile.currency,
      certainty: resolved.certainty,
    };
  },

  sumCosts: (blocks: ActivityBlock[]): CostRange => {
    if (blocks.length === 0) {
      return {
        min: 0,
        max: 0,
        currency: "EUR",
        certainty: "unknown",
      };
    }

    const primaryCurrency = blocks[0]?.estimatedCost.currency ?? "EUR";
    const converted = blocks.map((block) => convertRange(block.estimatedCost, primaryCurrency));
    const certainty: CostRange["certainty"] =
      converted.some((cost) => cost.certainty === "unknown") ? "unknown" : converted.some((cost) => cost.certainty === "estimated") ? "estimated" : "exact";

    return {
      min: converted.reduce((sum, block) => sum + block.min, 0),
      max: converted.reduce((sum, block) => sum + block.max, 0),
      currency: primaryCurrency,
      certainty,
    };
  },
};
