import type { SuggestedTrip } from "../../services/home/homeTripSuggestionTypes";

const STORAGE_KEY = "wandermint:homeSuggestionTripPrefill:v1";

export type HomeSuggestionTripPrefill = {
  segmentCity: string;
  segmentCountry: string;
  startDate: string;
  endDate: string;
  sourceSuggestionId: string;
};

export const writeHomeSuggestionTripPrefill = (trip: SuggestedTrip): void => {
  const city = trip.destination.city?.trim() ?? "";
  const country = trip.destination.country.trim();
  if (!country || !trip.recommendedDateWindow?.startDate || !trip.recommendedDateWindow?.endDate) {
    return;
  }
  const payload: HomeSuggestionTripPrefill = {
    segmentCity: city || country,
    segmentCountry: country,
    startDate: trip.recommendedDateWindow.startDate,
    endDate: trip.recommendedDateWindow.endDate,
    sourceSuggestionId: trip.id,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
};

export const readAndConsumeHomeSuggestionTripPrefill = (): HomeSuggestionTripPrefill | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as HomeSuggestionTripPrefill;
    if (!parsed.segmentCountry?.trim() || !parsed.startDate?.trim() || !parsed.endDate?.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
