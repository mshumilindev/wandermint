import type { CountryMeta } from "./countryMetaProvider";
import { relativePriceIndex } from "./worldBankPriceLevelProvider";
import type { FoodBudgetEstimate } from "../types/pricing.types";

const nowIso = (): string => new Date().toISOString();

const WB_URL = "https://data.worldbank.org/indicator/PA.NUS.PRVT.PP";

/**
 * Food spend band derived from (a) your observed trip daily spend when available and
 * (b) World Bank private-consumption PPP ratio between home and destination — not restaurant menus.
 */
export const estimateFoodBudget = async (params: {
  destinationLabel: string;
  destinationCountryMeta: CountryMeta | null;
  originCountryMeta: CountryMeta | null;
  userCurrency: string;
  userAvgDailySpend: number | null;
  durationDays: number;
  foodStyle: "budget" | "balanced" | "foodie" | "premium";
}): Promise<FoodBudgetEstimate> => {
  if (!params.userAvgDailySpend || params.userAvgDailySpend <= 0) {
    return {
      provider: "none",
      sourceUrl: WB_URL,
      destination: params.destinationLabel,
      currency: params.userCurrency,
      dailyMin: 0,
      dailyMax: 0,
      totalMin: 0,
      totalMax: 0,
      assumptions: [
        "Food estimate requires your historical trip spend signals — take a trip or set budget preferences, then refresh.",
        `When available, scaling uses World Bank private consumption PPP (${WB_URL}) vs home.`,
      ],
      confidence: "unavailable",
      fetchedAt: nowIso(),
    };
  }

  const ratio = await relativePriceIndex(params.originCountryMeta, params.destinationCountryMeta);
  const baseDaily = params.userAvgDailySpend * 0.32;
  const styleMul = params.foodStyle === "premium" ? 1.35 : params.foodStyle === "foodie" ? 1.18 : params.foodStyle === "budget" ? 0.85 : 1;
  const adjusted = ratio !== null && Number.isFinite(ratio) ? baseDaily * ratio * styleMul : baseDaily * styleMul;

  const confidence = ratio !== null ? ("medium" as const) : ("low" as const);

  const dailyMin = Math.max(8, Math.round(adjusted * 0.78));
  const dailyMax = Math.max(dailyMin + 1, Math.round(adjusted * 1.22));
  const totalMin = dailyMin * params.durationDays;
  const totalMax = dailyMax * params.durationDays;

  const assumptions = [
    `Scaled from your historical trip daily spend (~${Math.round(params.userAvgDailySpend)} ${params.userCurrency}/day) × food share (~32%).`,
    ratio !== null
      ? `Destination vs home cost level from World Bank private consumption PPP ratio (${ratio.toFixed(3)}).`
      : "PPP ratio unavailable — only your baseline spend multiplier was applied.",
    "Assumes casual breakfast, casual lunch, mid-range dinner; snacks/coffee light.",
    `Methodology: ${WB_URL}`,
  ];

  return {
    provider: "world_bank_ppp+user_history",
    sourceUrl: WB_URL,
    destination: params.destinationLabel,
    currency: params.userCurrency,
    dailyMin,
    dailyMax,
    totalMin,
    totalMax,
    assumptions,
    confidence,
    fetchedAt: nowIso(),
  };
};
