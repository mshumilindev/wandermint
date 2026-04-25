import type { MusicTasteProfile } from "../../integrations/music/musicTypes";
import type { MusicEventSuggestion, TripMusicEventWindow } from "./musicEventTypes";
import { mapTmEventToSuggestion, searchTicketmasterMusicEvents } from "./ticketmasterEventProvider";
import { evaluateMusicSuggestionRelevance, generateMusicSuggestionExplanation } from "../personalization/music/musicAiLayer";

const MAX_ARTISTS = 5;
const MAX_RESULTS = 3;

const norm = (s: string): string => s.trim().toLowerCase();

const eventInTripWindow = (trip: TripMusicEventWindow, localDate: string | undefined, startDateTime: string | undefined): boolean => {
  const start = trip.dateRange.start;
  const end = trip.dateRange.end;
  const d = localDate ?? (startDateTime ? startDateTime.slice(0, 10) : "");
  if (!d) {
    return false;
  }
  return d >= start && d <= end;
};

const eventMatchesTripGeo = (trip: TripMusicEventWindow, city?: string, country?: string): boolean => {
  const cities = new Set(trip.tripSegments.map((s) => norm(s.city)));
  const countries = new Set(trip.tripSegments.map((s) => norm(s.country)));
  if (city && cities.has(norm(city))) {
    return true;
  }
  if (city && countries.size > 0 && [...countries].some((c) => norm(city).includes(c) || c.includes(norm(city)))) {
    return true;
  }
  if (country && countries.has(norm(country))) {
    return true;
  }
  return false;
};

export const findMusicEventsForTrip = async (params: {
  trip: TripMusicEventWindow;
  profile: MusicTasteProfile;
}): Promise<MusicEventSuggestion[]> => {
  const apiKey = import.meta.env.VITE_TICKETMASTER_API_KEY as string | undefined;
  if (!apiKey?.trim()) {
    return [];
  }
  const { trip, profile } = params;
  const artists = profile.topArtists
    .filter((a) => a.confidence === "high" || a.confidence === "medium")
    .slice(0, MAX_ARTISTS);
  if (artists.length === 0) {
    return [];
  }
  const primary = trip.tripSegments[0];
  if (!primary) {
    return [];
  }
  const startDate = trip.dateRange.start;
  const endDate = trip.dateRange.end;
  const seen = new Set<string>();
  const candidates: MusicEventSuggestion[] = [];

  for (const artist of artists) {
    const rows = await searchTicketmasterMusicEvents({
      apiKey,
      keyword: artist.name,
      city: primary.city,
      countryCode: primary.country?.length === 2 ? primary.country : undefined,
      startDate,
      endDate,
      limit: 8,
    });
    for (const ev of rows) {
      const localDate = ev.dates?.start?.localDate;
      const startDateTime = ev.dates?.start?.dateTime;
      if (!eventInTripWindow(trip, localDate, startDateTime)) {
        continue;
      }
      const venue = ev._embedded?.venues?.[0];
      if (!eventMatchesTripGeo(trip, venue?.city?.name, venue?.country?.name)) {
        continue;
      }
      const title = (ev.name ?? "").toLowerCase();
      const matchedGenre = profile.topGenres[0]?.name;
      const reason = await generateMusicSuggestionExplanation({
        suggestionTitle: ev.name ?? "Event",
        matchedArtistName: title.includes(norm(artist.name)) ? artist.name : artist.name,
        matchedGenre,
        city: venue?.city?.name ?? primary.city,
      });
      const mapped = mapTmEventToSuggestion(ev, artist.name, matchedGenre, reason);
      if (!mapped) {
        continue;
      }
      const key = `${mapped.providerEventId}|${mapped.localDate ?? ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push(mapped);
      if (candidates.length >= 12) {
        break;
      }
    }
    if (candidates.length >= 12) {
      break;
    }
  }

  const evaluated: MusicEventSuggestion[] = [];
  for (const c of candidates.slice(0, 8)) {
    const decision = await evaluateMusicSuggestionRelevance({
      suggestion: c,
      trip,
      profileSummary: { topArtists: profile.topArtists, topGenres: profile.topGenres, updatedAt: profile.updatedAt },
    });
    if (!decision.shouldSuggest) {
      continue;
    }
    evaluated.push({ ...c, reason: decision.reason });
    if (evaluated.length >= MAX_RESULTS) {
      break;
    }
  }
  return evaluated;
};

export const filterConcertsForTonightLocal = async (_args: {
  city: string;
  country?: string;
  profile: MusicTasteProfile | null;
}): Promise<MusicEventSuggestion[]> => {
  void _args;
  return [];
};
