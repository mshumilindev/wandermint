import type { CostRange } from "../../entities/activity/model";

const fxToUsd: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  PLN: 0.26,
  GBP: 1.27,
  JPY: 0.0067,
  CZK: 0.043,
};

interface PriceDisplayPreferences {
  preferredCurrency?: string | null;
  locale?: string | null;
}

const normalizeCurrency = (currency: string | null | undefined): string | null => {
  if (!currency) {
    return null;
  }

  const normalized = currency.trim().toUpperCase();
  return normalized.length >= 3 ? normalized : null;
};

const formatMoney = (value: number, currency: string, locale?: string | null): string => {
  const formatter = new Intl.NumberFormat(locale ?? "en", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
    minimumFractionDigits: value >= 100 ? 0 : 0,
  });

  return formatter.format(value);
};

const convertAmount = (value: number, fromCurrency: string, toCurrency: string): number | null => {
  const fromRate = fxToUsd[fromCurrency];
  const toRate = fxToUsd[toCurrency];

  if (!fromRate || !toRate) {
    return null;
  }

  const usdValue = value * fromRate;
  return usdValue / toRate;
};

const formatRange = (min: number, max: number, currency: string, locale?: string | null): string => {
  if (Math.abs(min - max) < 0.01) {
    return formatMoney(min, currency, locale);
  }

  return `${formatMoney(min, currency, locale)}-${formatMoney(max, currency, locale)}`;
};

export const formatCostRangeLabel = (
  cost: CostRange,
  preferences?: PriceDisplayPreferences,
): string => {
  const localCurrency = normalizeCurrency(cost.currency) ?? "USD";
  const preferredCurrency = normalizeCurrency(preferences?.preferredCurrency);
  const approximate = cost.certainty !== "exact";
  const localLabel = formatRange(cost.min, cost.max, localCurrency, preferences?.locale);

  if (!preferredCurrency || preferredCurrency === localCurrency) {
    return approximate ? `${localLabel} · approx.` : localLabel;
  }

  const convertedMin = convertAmount(cost.min, localCurrency, preferredCurrency);
  const convertedMax = convertAmount(cost.max, localCurrency, preferredCurrency);
  if (convertedMin === null || convertedMax === null) {
    return approximate ? `${localLabel} · approx.` : localLabel;
  }

  const preferredLabel = formatRange(convertedMin, convertedMax, preferredCurrency, preferences?.locale);
  return `${localLabel} · ${preferredLabel}${approximate ? " · approx." : ""}`;
};

export const formatEstimatedCostLabel = (
  cost: { min: number; max: number; currency: string; approximate: boolean },
  preferences?: PriceDisplayPreferences,
): string => {
  const localCurrency = normalizeCurrency(cost.currency) ?? "USD";
  const preferredCurrency = normalizeCurrency(preferences?.preferredCurrency);
  const localLabel = formatRange(cost.min, cost.max, localCurrency, preferences?.locale);

  if (!preferredCurrency || preferredCurrency === localCurrency) {
    return cost.approximate ? `${localLabel} · approx.` : localLabel;
  }

  const convertedMin = convertAmount(cost.min, localCurrency, preferredCurrency);
  const convertedMax = convertAmount(cost.max, localCurrency, preferredCurrency);
  if (convertedMin === null || convertedMax === null) {
    return cost.approximate ? `${localLabel} · approx.` : localLabel;
  }

  const preferredLabel = formatRange(convertedMin, convertedMax, preferredCurrency, preferences?.locale);
  return `${localLabel} · ${preferredLabel}${cost.approximate ? " · approx." : ""}`;
};

export const formatBudgetAmountLabel = (
  amount: number,
  currency: string,
  preferences?: PriceDisplayPreferences,
): string => {
  const localCurrency = normalizeCurrency(currency) ?? "USD";
  const preferredCurrency = normalizeCurrency(preferences?.preferredCurrency);
  const localLabel = formatMoney(amount, localCurrency, preferences?.locale);

  if (!preferredCurrency || preferredCurrency === localCurrency) {
    return localLabel;
  }

  const converted = convertAmount(amount, localCurrency, preferredCurrency);
  if (converted === null) {
    return localLabel;
  }

  return `${localLabel} · ${formatMoney(converted, preferredCurrency, preferences?.locale)}`;
};
