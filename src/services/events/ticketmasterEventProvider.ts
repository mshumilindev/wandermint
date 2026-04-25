/**
 * Client-side Ticketmaster Discovery (optional). Prefer a backend proxy in production
 * to avoid exposing API keys — uses `VITE_TICKETMASTER_API_KEY` only when set.
 */
const TM_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";

interface TmImage {
  url?: string;
  width?: number;
  height?: number;
}

interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  images?: TmImage[];
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
  };
  _embedded?: { venues?: { name?: string; city?: { name?: string }; country?: { name?: string; countryCode?: string } }[] };
}

interface TmResponse {
  _embedded?: { events?: TmEvent[] };
}

const pickImage = (images: TmImage[] | undefined): string | undefined => {
  if (!Array.isArray(images) || images.length === 0) {
    return undefined;
  }
  const sorted = [...images].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return sorted[0]?.url;
};

export const searchTicketmasterMusicEvents = async (params: {
  apiKey: string;
  keyword: string;
  city?: string;
  countryCode?: string;
  startDate: string;
  endDate: string;
  limit: number;
}): Promise<TmEvent[]> => {
  const url = new URL(TM_BASE);
  url.searchParams.set("apikey", params.apiKey);
  url.searchParams.set("keyword", [params.keyword, params.city].filter(Boolean).join(" "));
  url.searchParams.set("size", String(Math.min(Math.max(params.limit, 1), 30)));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("startDateTime", `${params.startDate}T00:00:00Z`);
  url.searchParams.set("endDateTime", `${params.endDate}T23:59:59Z`);
  if (params.countryCode?.trim()) {
    url.searchParams.set("countryCode", params.countryCode.trim().toUpperCase());
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[ticketmaster]", "request failed", res.status);
    }
    return [];
  }
  const json = (await res.json()) as TmResponse;
  return Array.isArray(json._embedded?.events) ? json._embedded.events : [];
};

export const mapTmEventToSuggestion = (
  event: TmEvent,
  matchedArtistName: string | undefined,
  matchedGenre: string | undefined,
  reason: string,
): import("./musicEventTypes").MusicEventSuggestion | null => {
  const id = typeof event.id === "string" ? event.id : "";
  const title = typeof event.name === "string" ? event.name : "";
  if (!id || !title) {
    return null;
  }
  const venue = event._embedded?.venues?.[0];
  const localDate = event.dates?.start?.localDate;
  const localTime = event.dates?.start?.localTime;
  const startDateTime = event.dates?.start?.dateTime;
  if (!localDate && !startDateTime) {
    return null;
  }
  return {
    id: `tm_${id}`,
    provider: "ticketmaster",
    providerEventId: id,
    title,
    venueName: venue?.name,
    city: venue?.city?.name,
    country: venue?.country?.name,
    localDate,
    localTime,
    startDateTime,
    imageUrl: pickImage(event.images),
    eventUrl: typeof event.url === "string" ? event.url : undefined,
    matchedArtistName,
    matchedGenre,
    confidence: matchedArtistName ? "high" : "medium",
    reason,
    optional: true,
  };
};
