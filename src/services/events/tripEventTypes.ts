import type { AnchorEvent } from "../../entities/trip/model";
import type { PlaceCandidate } from "../places/placeTypes";

export type TripEvent = {
  id: string;
  mode: "resolved" | "custom";
  title: string;
  venue?: PlaceCandidate;
  city?: string;
  country?: string;
  startDateTime?: string;
  endDateTime?: string;
  coordinates?: { lat: number; lng: number };
  locked: true;
};

const isResolvedAnchor = (e: AnchorEvent): boolean =>
  Boolean(
    e.provider &&
      e.provider !== "manual" &&
      e.provider !== "fallback" &&
      (e.providerEventId?.trim().length ?? 0) > 0,
  );

const venuePlaceFromAnchor = (e: AnchorEvent): PlaceCandidate | undefined => {
  if (!e.venue?.trim()) {
    return undefined;
  }
  const coords =
    e.latitude !== undefined && e.longitude !== undefined && Number.isFinite(e.latitude) && Number.isFinite(e.longitude)
      ? { lat: e.latitude, lng: e.longitude }
      : undefined;
  return {
    id: `venue:${e.provider ?? "manual"}:${e.providerEventId ?? e.id}`,
    provider: "osm",
    providerId: `anchor-venue:${e.id}`,
    name: e.venue.trim(),
    city: e.city,
    country: e.country,
    coordinates: coords,
    categories: ["event_venue", e.type],
  };
};

/** View model for prompts + venue-aware planning; derived from persisted anchors. */
export const anchorEventToTripEvent = (e: AnchorEvent): TripEvent => {
  const coords =
    e.latitude !== undefined && e.longitude !== undefined && Number.isFinite(e.latitude) && Number.isFinite(e.longitude)
      ? { lat: e.latitude, lng: e.longitude }
      : undefined;
  return {
    id: e.id,
    mode: isResolvedAnchor(e) ? "resolved" : "custom",
    title: e.title,
    venue: venuePlaceFromAnchor(e),
    city: e.city,
    country: e.country,
    startDateTime: e.startAt,
    endDateTime: e.endAt,
    coordinates: coords,
    locked: true,
  };
};

export const formatStructuredTripEventsForPrompt = (events: readonly AnchorEvent[]): string => {
  if (events.length === 0) {
    return "";
  }
  return events
    .map((e) => {
      const te = anchorEventToTripEvent(e);
      const coord = te.coordinates ? ` @${te.coordinates.lat.toFixed(5)},${te.coordinates.lng.toFixed(5)}` : "";
      const venue = te.venue?.name ? ` venue="${te.venue.name}"` : "";
      const src = te.mode === "resolved" ? `provider=${e.provider ?? "?"} id=${e.providerEventId ?? "n/a"}` : "manual/custom";
      return `- ${te.title}${venue} [${src}]${coord} window=${te.startDateTime ?? "unknown"}→${te.endDateTime ?? "open"}`;
    })
    .join("\n");
};
