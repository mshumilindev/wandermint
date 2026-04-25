import { z } from "zod";
import type { CountryMeta } from "./countryMetaProvider";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: number | null }>();

const wbSchema = z.array(
  z.object({
    indicator: z.object({ id: z.string().optional() }).optional(),
    country: z.object({ id: z.string().optional() }).optional(),
    date: z.string().optional(),
    value: z
      .union([z.number(), z.string()])
      .nullable()
      .transform((v) => {
        if (v === null) {
          return null;
        }
        if (typeof v === "number") {
          return Number.isFinite(v) ? v : null;
        }
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }),
  }),
);

/**
 * Private consumption PPP conversion factor (LCU per international $) — latest non-null year.
 * @see https://data.worldbank.org/indicator/PA.NUS.PRVT.PP
 */
export const fetchPrivateConsumptionPpp = async (iso3: string): Promise<number | null> => {
  const code = iso3.trim().toUpperCase();
  if (!code) {
    return null;
  }
  const hit = cache.get(code);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  const url = `https://api.worldbank.org/v2/country/${code}/indicator/PA.NUS.PRVT.PP?format=json&per_page=60&mrnev=1`;
  const response = await fetch(url);
  if (!response.ok) {
    cache.set(code, { value: null, expiresAt: Date.now() + TTL_MS });
    return null;
  }
  const body: unknown = await response.json();
  const rows = Array.isArray(body) ? body[1] : null;
  const parsed = wbSchema.safeParse(rows);
  if (!parsed.success) {
    cache.set(code, { value: null, expiresAt: Date.now() + TTL_MS });
    return null;
  }
  const sorted = [...parsed.data].sort((a, b) => Number(b.date ?? 0) - Number(a.date ?? 0));
  const first = sorted.find((r) => typeof r.value === "number" && Number.isFinite(r.value));
  const value = first?.value ?? null;
  cache.set(code, { value, expiresAt: Date.now() + TTL_MS });
  return value;
};

export const relativePriceIndex = async (origin: CountryMeta | null, destination: CountryMeta | null): Promise<number | null> => {
  if (!origin || !destination) {
    return null;
  }
  const [o, d] = await Promise.all([fetchPrivateConsumptionPpp(origin.iso3), fetchPrivateConsumptionPpp(destination.iso3)]);
  if (o === null || d === null || o <= 0) {
    return null;
  }
  return d / o;
};
