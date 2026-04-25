import type { EntityMediaAttachment } from "../media/model";
import type { EventLookupEventType, EventLookupProvider, FestivalSelection } from "../events/eventLookup.model";

export interface MemoryAnchorEvent {
  id: string;
  title: string;
  eventDate: string;
  endDate?: string;
  city: string;
  country: string;
  countryCode?: string;
  venue?: string;
  artistName?: string;
  festivalName?: string;
  startTime?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  sourceUrl?: string;
  imageUrl?: string;
  ticketUrl?: string;
  provider?: EventLookupProvider;
  providerEventId?: string;
  eventType?: EventLookupEventType;
  festivalSelection?: FestivalSelection;
}

export interface TravelMemory {
  id: string;
  userId: string;
  city: string;
  country: string;
  datePrecision: "exact" | "month";
  startDate: string;
  endDate: string;
  latitude?: number;
  longitude?: number;
  geoLabel?: string;
  style: "culture" | "food" | "nature" | "nightlife" | "rest" | "mixed";
  notes: string;
  /** Concerts, matches, festivals, or other anchor events tied to this trip. */
  anchorEvents?: MemoryAnchorEvent[];
  /** Optional linked media (e.g. Instagram posts resolved via Meta APIs). */
  mediaAttachments?: EntityMediaAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface TravelStats {
  visitedCountries: number;
  visitedCities: number;
  tripsRecorded: number;
  travelDays: number;
  repeatVisits: number;
  mostVisited: Array<{ label: string; count: number }>;
  yearlyActivity: Array<{ label: string; count: number }>;
  styleDistribution: Array<{ style: TravelMemory["style"]; count: number }>;
}
