export type EventLookupProvider = "ticketmaster" | "bandsintown" | "songkick" | "manual" | "fallback";

export type EventLookupEventType = "concert" | "festival" | "multi_day_festival" | "venue_event" | "unknown";

export interface EventLookupResult {
  id: string;
  provider: EventLookupProvider;
  providerEventId?: string;
  title: string;
  artistName?: string;
  festivalName?: string;
  eventType: EventLookupEventType;
  venueName?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  coordinates?: { lat: number; lng: number };
  startDate?: string;
  endDate?: string;
  startTime?: string;
  timezone?: string;
  imageUrl?: string;
  sourceUrl?: string;
  ticketUrl?: string;
  lineup?: string[];
  description?: string;
  confidence: number;
}

export type SearchMode = "upcoming" | "past";
