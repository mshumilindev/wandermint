import { z } from "zod";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: CountryMeta }>();

const responseSchema = z.array(
  z.object({
    cca2: z.string(),
    cca3: z.string(),
    name: z.object({ common: z.string() }),
  }),
);

export type CountryMeta = {
  iso2: string;
  iso3: string;
  commonName: string;
};

/**
 * Resolves ISO2/ISO3 for World Bank + rate APIs using RestCountries (public, no key).
 */
export const fetchCountryMetaByName = async (countryName: string): Promise<CountryMeta | null> => {
  const q = countryName.trim();
  if (!q) {
    return null;
  }
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fields=cca2,cca3,name`;
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.length === 0) {
    return null;
  }
  const row = parsed.data[0]!;
  const value: CountryMeta = { iso2: row.cca2, iso3: row.cca3, commonName: row.name.common };
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
};
