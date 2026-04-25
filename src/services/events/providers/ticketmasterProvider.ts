import { z } from "zod";

/** Narrow DTO mapped to {@link EventSearchResult} in the feature search layer. */
export type TicketmasterEventHit = {
  id: string;
  title: string;
  venueName: string;
  city: string;
  country: string;
  startDate: string;
  startTime?: string;
  coordinates?: { lat: number; lng: number };
  imageUrl?: string;
  sourceUrl?: string;
  ticketUrl?: string;
  providerEventId?: string;
};

const eventSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string().optional(),
  images: z.array(z.object({ url: z.string().optional() })).optional(),
  dates: z
    .object({
      start: z
        .object({
          dateTime: z.string().optional(),
          localDate: z.string().optional(),
          localTime: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  _embedded: z
    .object({
      venues: z
        .array(
          z.object({
            name: z.string().optional(),
            city: z.object({ name: z.string().optional() }).optional(),
            country: z.object({ countryCode: z.string().optional() }).optional(),
            location: z.object({ longitude: z.string().optional(), latitude: z.string().optional() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const responseSchema = z.object({
  _embedded: z.object({ events: z.array(eventSchema).optional() }).optional(),
});

export type TicketmasterSearchParams = {
  query: string;
  city?: string;
  countryCode?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  signal?: AbortSignal;
};

const toYmd = (iso?: string, localDate?: string): string => {
  if (localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return localDate;
  }
  if (iso && iso.length >= 10) {
    return iso.slice(0, 10);
  }
  return "";
};

const mapEvent = (raw: z.infer<typeof eventSchema>): TicketmasterEventHit | null => {
  const title = raw.name?.trim();
  const venue = raw._embedded?.venues?.[0];
  const venueName = venue?.name?.trim() || "Unknown venue";
  const city = venue?.city?.name?.trim() ?? "";
  const country = venue?.country?.countryCode?.trim() ?? "";
  const startDate = toYmd(raw.dates?.start?.dateTime, raw.dates?.start?.localDate);
  if (!title || !startDate) {
    return null;
  }
  const latStr = venue?.location?.latitude;
  const lngStr = venue?.location?.longitude;
  const lat = latStr !== undefined ? Number(latStr) : undefined;
  const lng = lngStr !== undefined ? Number(lngStr) : undefined;
  const coordinates =
    lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  const startTime = raw.dates?.start?.localTime?.trim() || undefined;
  const imageUrl = raw.images?.find((i) => i.url?.includes("RETINA_PORTRAIT"))?.url ?? raw.images?.[0]?.url;

  return {
    id: `tm:${raw.id ?? title}`,
    title,
    venueName,
    city,
    country,
    startDate,
    coordinates,
    imageUrl,
    sourceUrl: raw.url,
    ticketUrl: raw.url,
    startTime,
    providerEventId: raw.id,
  };
};

/**
 * Ticketmaster Discovery API. Requires `VITE_TICKETMASTER_API_KEY`.
 * Returns [] when unset or on any failure (no user-visible throw from callers).
 */
export const searchTicketmasterEvents = async (params: TicketmasterSearchParams): Promise<TicketmasterEventHit[]> => {
  const apiKey = import.meta.env.VITE_TICKETMASTER_API_KEY?.trim();
  if (!apiKey || params.query.trim().length < 2) {
    return [];
  }
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 20);
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("keyword", params.query.trim());
  url.searchParams.set("size", String(limit));
  url.searchParams.set("sort", "date,asc");
  if (params.city?.trim()) {
    url.searchParams.set("city", params.city.trim());
  }
  if (params.countryCode?.trim() && params.countryCode.trim().length === 2) {
    url.searchParams.set("countryCode", params.countryCode.trim().toUpperCase());
  }
  if (params.startDate?.trim()) {
    url.searchParams.set("startDateTime", `${params.startDate.trim()}T00:00:00Z`);
  }
  if (params.endDate?.trim()) {
    url.searchParams.set("endDateTime", `${params.endDate.trim()}T23:59:59Z`);
  }

  try {
    const response = await fetch(url.toString(), { signal: params.signal });
    if (!response.ok) {
      return [];
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return [];
    }
    const rows = parsed.data._embedded?.events ?? [];
    const out: TicketmasterEventHit[] = [];
    for (const row of rows) {
      const mapped = mapEvent(row);
      if (mapped) {
        out.push(mapped);
      }
    }
    return out;
  } catch {
    return [];
  }
};
