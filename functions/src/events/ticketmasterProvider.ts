import type { EventLookupEventType, EventLookupResult, SearchMode } from "./types.js";

interface TicketmasterImage {
  url: string;
  width?: number;
  height?: number;
}

interface TicketmasterVenue {
  name?: string;
  city?: { name?: string };
  country?: { name?: string; countryCode?: string };
  location?: { latitude?: string; longitude?: string };
}

interface TicketmasterClassification {
  segment?: { name?: string };
  genre?: { name?: string };
}

interface TicketmasterEvent {
  id?: string;
  name?: string;
  url?: string;
  description?: string;
  images?: TicketmasterImage[];
  classifications?: TicketmasterClassification[];
  dates?: {
    timezone?: string;
    spanMultipleDays?: boolean;
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    end?: { localDate?: string; localTime?: string; dateTime?: string };
  };
  _embedded?: { venues?: TicketmasterVenue[] };
}

interface TicketmasterSearchResponse {
  _embedded?: { events?: TicketmasterEvent[] };
}

const pickImage = (images: TicketmasterImage[] | undefined): string | undefined => {
  if (!images?.length) {
    return undefined;
  }
  const sorted = [...images].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return sorted[0]?.url;
};

const mapClassification = (event: TicketmasterEvent): EventLookupEventType => {
  const seg = event.classifications?.[0]?.segment?.name?.toLowerCase() ?? "";
  const genre = event.classifications?.[0]?.genre?.name?.toLowerCase() ?? "";
  const hay = `${seg} ${genre} ${event.name?.toLowerCase() ?? ""}`;
  if (hay.includes("festival") || event.dates?.spanMultipleDays) {
    return event.dates?.spanMultipleDays ? "multi_day_festival" : "festival";
  }
  if (hay.includes("music") || hay.includes("concert")) {
    return "concert";
  }
  if (hay.includes("arts") || hay.includes("theatre") || hay.includes("family")) {
    return "venue_event";
  }
  return "unknown";
};

const scoreConfidence = (query: string, event: TicketmasterEvent): number => {
  const q = query.toLowerCase().trim();
  const title = (event.name ?? "").toLowerCase();
  if (!q) {
    return 0.55;
  }
  if (title === q) {
    return 0.98;
  }
  if (title.includes(q) || q.includes(title.slice(0, Math.min(12, title.length)))) {
    return 0.82;
  }
  return 0.62;
};

export const searchTicketmasterEvents = async (params: {
  apiKey: string;
  query: string;
  mode: SearchMode;
  city?: string;
  countryCode?: string;
  startDate?: string;
  endDate?: string;
  limit: number;
}): Promise<EventLookupResult[]> => {
  const { apiKey, query, mode, city, countryCode, startDate, endDate, limit } = params;
  const keyword = [query.trim(), city?.trim()].filter(Boolean).join(" ");
  if (!keyword.trim()) {
    return [];
  }

  const now = new Date();
  const pad = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

  let startWindow: string;
  let endWindow: string;
  if (mode === "upcoming") {
    startWindow = pad(now);
    endWindow = pad(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000));
  } else if (startDate && endDate) {
    startWindow = `${startDate}T00:00:00Z`;
    endWindow = `${endDate}T23:59:59Z`;
  } else {
    const pastEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pastStart = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
    startWindow = pad(pastStart);
    endWindow = pad(pastEnd);
  }

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("size", String(Math.min(Math.max(limit, 1), 50)));
  url.searchParams.set("sort", mode === "upcoming" ? "date,asc" : "date,desc");
  url.searchParams.set("startDateTime", startWindow);
  url.searchParams.set("endDateTime", endWindow);
  if (countryCode?.trim()) {
    url.searchParams.set("countryCode", countryCode.trim().toUpperCase());
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [];
  }
  const json = (await res.json()) as TicketmasterSearchResponse;
  const raw = json._embedded?.events ?? [];

  return raw.map((event) => {
    const venue = event._embedded?.venues?.[0];
    const lat = venue?.location?.latitude ? Number(venue.location.latitude) : undefined;
    const lng = venue?.location?.longitude ? Number(venue.location.longitude) : undefined;
    const startLocalDate = event.dates?.start?.localDate;
    const endLocalDate = event.dates?.end?.localDate ?? startLocalDate;
    const startLocalTime = event.dates?.start?.localTime?.slice(0, 5);
    const eventType = mapClassification(event);
    const artistName = event.classifications?.[0]?.genre?.name;

    const result: EventLookupResult = {
      id: `tm_${event.id ?? "unknown"}`,
      provider: "ticketmaster",
      providerEventId: event.id,
      title: event.name ?? "Event",
      artistName,
      festivalName: eventType === "festival" || eventType === "multi_day_festival" ? event.name : undefined,
      eventType,
      venueName: venue?.name,
      city: venue?.city?.name,
      country: venue?.country?.name,
      countryCode: venue?.country?.countryCode,
      coordinates: lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
      startDate: startLocalDate,
      endDate: endLocalDate,
      startTime: startLocalTime,
      timezone: event.dates?.timezone,
      imageUrl: pickImage(event.images),
      sourceUrl: event.url,
      ticketUrl: event.url,
      description: typeof event.description === "string" ? event.description : undefined,
      confidence: scoreConfidence(query, event),
    };
    return result;
  });
};
