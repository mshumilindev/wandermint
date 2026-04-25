import type { TransportPriceQuote } from "../types/pricing.types";

const nowIso = (): string => new Date().toISOString();

/**
 * Live published fares require a server-side aggregator (Duffel, Amadeus, Kiwi, etc.).
 * The SPA does not ship booking API secrets — returns explicit unavailable until a proxy is configured.
 *
 * TODO: wire `VITE_TRIP_TRANSPORT_QUOTE_URL` (your Cloud Function) returning {@link TransportPriceQuote} JSON.
 */
export const fetchTransportPriceQuote = async (params: {
  originLabel: string;
  destinationCity: string;
  destinationCountry: string;
  departureDate: string;
  returnDate?: string;
  currency: string;
}): Promise<TransportPriceQuote> => {
  const proxy = import.meta.env.VITE_TRIP_TRANSPORT_QUOTE_URL?.trim();
  if (!proxy) {
    return {
      provider: "none",
      origin: params.originLabel,
      destination: `${params.destinationCity}, ${params.destinationCountry}`,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      currency: params.currency,
      minPrice: 0,
      maxPrice: 0,
      options: [],
      confidence: "unavailable",
      fetchedAt: nowIso(),
    };
  }
  try {
    const response = await fetch(proxy, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    const body = (await response.json()) as TransportPriceQuote;
    if (typeof body.minPrice !== "number" || !Number.isFinite(body.minPrice)) {
      throw new Error("Invalid quote payload");
    }
    return { ...body, fetchedAt: body.fetchedAt || nowIso() };
  } catch {
    return {
      provider: "proxy_error",
      origin: params.originLabel,
      destination: `${params.destinationCity}, ${params.destinationCountry}`,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      currency: params.currency,
      minPrice: 0,
      maxPrice: 0,
      options: [],
      confidence: "unavailable",
      fetchedAt: nowIso(),
    };
  }
};
