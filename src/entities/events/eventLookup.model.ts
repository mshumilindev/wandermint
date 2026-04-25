export type EventLookupProvider = "ticketmaster" | "bandsintown" | "songkick" | "manual" | "fallback";

export type EventLookupEventType = "concert" | "festival" | "multi_day_festival" | "venue_event" | "unknown";

export type FestivalSelectionMode = "all_days" | "specific_days";

/** Persisted when user picks a subset of festival days for an anchor. */
export interface FestivalSelection {
  mode: FestivalSelectionMode;
  selectedDates: string[];
  originalStartDate: string;
  originalEndDate: string;
}

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
