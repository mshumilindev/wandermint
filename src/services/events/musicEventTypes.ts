import type { DateRange } from "../../entities/trip/model";
import type { TripSegment } from "../../entities/trip/model";
import type { Confidence } from "../../integrations/music/musicTypes";

export type TripMusicEventWindow = {
  destination: string;
  tripSegments: TripSegment[];
  dateRange: DateRange;
};

export type MusicEventProvider = "ticketmaster";

export type MusicEventSuggestion = {
  id: string;
  provider: MusicEventProvider;
  providerEventId: string;
  title: string;
  artistName?: string;
  venueName?: string;
  city?: string;
  country?: string;
  startDateTime?: string;
  localDate?: string;
  localTime?: string;
  imageUrl?: string;
  eventUrl?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  matchedArtistName?: string;
  matchedGenre?: string;
  confidence: Confidence;
  reason: string;
  optional: true;
};
