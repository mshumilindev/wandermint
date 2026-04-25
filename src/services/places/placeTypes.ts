export type PlaceProviderId = "google_places" | "osm";

export interface PlaceCandidate {
  id: string;
  provider: PlaceProviderId;
  providerId: string;
  name: string;
  city?: string;
  country?: string;
  coordinates?: { lat: number; lng: number };
  imageUrl?: string;
  rating?: number;
  categories: string[];
}

export interface TripPlace {
  id: string;
  mode: "resolved" | "custom";
  label: string;
  candidate?: PlaceCandidate;
  customText?: string;
  locked: true;
}

/** Hard cap for wizard + generation payloads. */
export const MAX_MUST_SEE_PLACES = 7;

/** Keeps `preferences.mustSeeNotes` aligned with structured picks for discovery + legacy scoring. */
export const deriveMustSeeNotesFromTripPlaces = (places: TripPlace[] | undefined): string =>
  (places ?? [])
    .map((p) => p.label.trim())
    .filter(Boolean)
    .join("; ");

export const tripPlaceDedupeKey = (place: TripPlace): string => {
  if (place.mode === "resolved" && place.candidate) {
    return `${place.candidate.provider}:${place.candidate.providerId}`;
  }
  return `custom:${(place.customText ?? place.label).trim().toLowerCase()}`;
};

export const formatLockedMustSeeForPrompt = (places: TripPlace[] | undefined): string => {
  if (!places?.length) {
    return "";
  }
  return places
    .map((p) => {
      const c = p.candidate;
      const coord =
        p.mode === "resolved" && c?.coordinates
          ? ` @${c.coordinates.lat.toFixed(5)},${c.coordinates.lng.toFixed(5)}`
          : "";
      const src = p.mode === "resolved" && c ? `${c.provider}:${c.providerId}` : "custom";
      return `- ${p.label} [mode=${p.mode}; source=${src}]${coord}`;
    })
    .join("\n");
};
