const TTL_MS = 6 * 60 * 60 * 1000;
const rateCache = new Map<string, { expiresAt: number; rate: number }>();

const cacheKey = (from: string, to: string): string => `${from.trim().toUpperCase()}>${to.trim().toUpperCase()}`;

/**
 * Live ECB-backed rates via Frankfurter (no API key).
 * @see https://www.frankfurter.app/docs/
 */
export const convertAmount = async (amount: number, fromCurrency: string, toCurrency: string): Promise<number> => {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (!Number.isFinite(amount) || from === to) {
    return amount;
  }
  const rate = await getEcbRate(from, to);
  return Math.round(amount * rate * 100) / 100;
};

export const getEcbRate = async (fromCurrency: string, toCurrency: string): Promise<number> => {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) {
    return 1;
  }
  const key = cacheKey(from, to);
  const hit = rateCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.rate;
  }
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Frankfurter rate failed (${response.status})`);
  }
  const body: unknown = await response.json();
  const parsed = body as { rates?: Record<string, number> };
  const rate = parsed.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error("Frankfurter response missing rate.");
  }
  rateCache.set(key, { rate, expiresAt: Date.now() + TTL_MS });
  return rate;
};
