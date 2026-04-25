import { debugLogError } from "../../shared/lib/errors";

/** REST Countries v3.1 partial document. */
interface RestCountry {
  name: { common: string; official: string };
  cca2: string;
  region: string;
  currencies?: Record<string, { name?: string; symbol?: string }>;
}

export type CurrencyOptionGroup = "home" | "region" | "popular" | "other";

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  group: CurrencyOptionGroup;
}

export interface CurrencyCatalog {
  byCode: Record<string, { name: string; symbol: string }>;
  countries: Array<{
    commonName: string;
    officialName: string;
    region: string;
    currencies: string[];
  }>;
}

const REST_URL = "https://restcountries.com/v3.1/all?fields=name,cca2,currencies,region";

const POPULAR_ORDER = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "CNY",
  "HKD",
  "SGD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "TRY",
  "MXN",
  "BRL",
  "ZAR",
  "KRW",
  "INR",
  "THB",
  "MYR",
  "PHP",
  "AED",
  "ILS",
  "IDR",
  "UAH",
];

let memoryCache: { catalog: CurrencyCatalog; fetchedAt: number } | null = null;
const CACHE_MS = 1000 * 60 * 60 * 24;

/** Narrow-symbol or code fallback for UI (not a country flag). */
export const formatCurrencyGlyph = (code: string, locale: string): string => {
  try {
    const parts = new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value;
    return sym && sym !== code ? sym : code;
  } catch {
    return code;
  }
};

const buildCatalogFromCountries = (rows: RestCountry[], locale: string): CurrencyCatalog => {
  const byCode: CurrencyCatalog["byCode"] = {};
  const countries: CurrencyCatalog["countries"] = [];

  for (const row of rows) {
    const codes = row.currencies ? Object.keys(row.currencies) : [];
    countries.push({
      commonName: row.name.common,
      officialName: row.name.official,
      region: row.region ?? "",
      currencies: codes,
    });

    for (const code of codes) {
      const meta = row.currencies?.[code];
      const name = meta?.name?.trim() || code;
      const sym = meta?.symbol?.trim() || formatCurrencyGlyph(code, locale);
      const existing = byCode[code];
      if (!existing || name.length > existing.name.length) {
        byCode[code] = { name, symbol: sym || formatCurrencyGlyph(code, locale) };
      }
    }
  }

  for (const code of Object.keys(byCode)) {
    const entry = byCode[code];
    if (!entry) {
      continue;
    }
    byCode[code] = {
      name: entry.name,
      symbol: entry.symbol || formatCurrencyGlyph(code, locale),
    };
  }

  return { byCode, countries };
};

const findCountry = (catalog: CurrencyCatalog, countryPart: string): CurrencyCatalog["countries"][number] | null => {
  const needle = countryPart.trim().toLowerCase();
  if (!needle) {
    return null;
  }

  return (
    catalog.countries.find((c) => c.commonName.toLowerCase() === needle) ??
    catalog.countries.find((c) => c.officialName.toLowerCase() === needle) ??
    catalog.countries.find((c) => needle.endsWith(c.commonName.toLowerCase())) ??
    null
  );
};

/**
 * Ordered list: home city currencies → same region → worldwide popular → rest A–Z.
 * Fetches live ISO catalogue from REST Countries (cached 24h in memory).
 */
export const buildOrderedCurrencyOptions = (homeCityLabel: string, catalog: CurrencyCatalog, locale: string): CurrencyOption[] => {
  const seen = new Set<string>();
  const push = (code: string, group: CurrencyOptionGroup): void => {
    const upper = code.toUpperCase();
    if (!/^[A-Z]{3}$/.test(upper) || !catalog.byCode[upper] || seen.has(upper)) {
      return;
    }
    seen.add(upper);
    const meta = catalog.byCode[upper];
    out.push({
      code: upper,
      name: meta.name,
      symbol: meta.symbol || formatCurrencyGlyph(upper, locale),
      group,
    });
  };

  const out: CurrencyOption[] = [];

  const parts = homeCityLabel.split(",").map((s) => s.trim()).filter(Boolean);
  const countryPart = parts.length >= 2 ? parts[parts.length - 1] : "";
  const homeCountry = countryPart ? findCountry(catalog, countryPart) : null;

  if (homeCountry) {
    for (const code of homeCountry.currencies) {
      push(code, "home");
    }
  }

  if (homeCountry?.region) {
    const regionalCodes = new Set<string>();
    for (const c of catalog.countries) {
      if (c.region === homeCountry.region) {
        c.currencies.forEach((x) => regionalCodes.add(x.toUpperCase()));
      }
    }
    const tier1 = ["EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY", "ISK"];
    const rest: string[] = [];
    for (const code of regionalCodes) {
      if (seen.has(code)) {
        continue;
      }
      if (tier1.includes(code)) {
        continue;
      }
      rest.push(code);
    }
    rest.sort((a, b) => a.localeCompare(b));
    for (const code of tier1) {
      if (regionalCodes.has(code)) {
        push(code, "region");
      }
    }
    for (const code of rest) {
      push(code, "region");
    }
  }

  for (const code of POPULAR_ORDER) {
    push(code, "popular");
  }

  const remaining = Object.keys(catalog.byCode)
    .map((c) => c.toUpperCase())
    .filter((c) => !seen.has(c))
    .sort((a, b) => a.localeCompare(b));
  for (const code of remaining) {
    push(code, "other");
  }

  return out;
};

export const fetchCurrencyCatalog = async (locale = "en"): Promise<CurrencyCatalog> => {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_MS) {
    return memoryCache.catalog;
  }

  try {
    const response = await fetch(REST_URL);
    if (!response.ok) {
      throw new Error(`REST Countries ${response.status}`);
    }
    const data = (await response.json()) as RestCountry[];
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Empty REST Countries payload");
    }
    const catalog = buildCatalogFromCountries(data, locale);
    memoryCache = { catalog, fetchedAt: Date.now() };
    return catalog;
  } catch (error) {
    debugLogError("currency_catalog_fetch", error);
    const byCode: CurrencyCatalog["byCode"] = {};
    for (const code of POPULAR_ORDER) {
      byCode[code] = { name: code, symbol: formatCurrencyGlyph(code, locale) };
    }
    return { byCode, countries: [] };
  }
};
