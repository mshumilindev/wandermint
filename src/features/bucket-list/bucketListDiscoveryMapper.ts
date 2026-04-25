import { createClientId } from "../../shared/lib/id";
import type { TripEvent } from "../../services/events/tripEventTypes";
import type { PlaceCandidate } from "../../services/places/placeTypes";
import type { AddBucketListItemInput, BucketListPayload, BucketListPriority } from "./bucketList.types";
import type { DiscoveryItem } from "./discovery/bucketListDiscovery.types";

export type MapDiscoveryItemToBucketOptions = {
  userId: string;
  priority: BucketListPriority;
  notes?: string;
};

const toPlaceCandidate = (item: DiscoveryItem): PlaceCandidate => {
  const providerId = item.source.provider?.trim() || "discovery";
  const name = item.title.trim() || "Saved place";
  return {
    id: `discovery:${providerId}:${name.toLowerCase().replace(/\s+/g, "-")}`,
    provider: "osm",
    providerId: `${providerId}:${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    city: item.location?.city,
    country: item.location?.country,
    coordinates: item.location?.coordinates,
    imageUrl: item.imageUrl,
    rating: item.rating,
    categories: item.tags,
  };
};

const toTripEvent = (item: DiscoveryItem): TripEvent => ({
  id: `disc_event_${createClientId("ev")}`,
  mode: "custom",
  title: item.title,
  city: item.location?.city,
  country: item.location?.country,
  startDateTime: item.event?.startDate,
  endDateTime: item.event?.endDate,
  coordinates: item.location?.coordinates,
  venue: item.event?.venueName
    ? {
        id: `venue:${createClientId("v")}`,
        provider: "osm",
        providerId: `venue:${createClientId("vref")}`,
        name: item.event.venueName,
        city: item.location?.city,
        country: item.location?.country,
        coordinates: item.location?.coordinates,
        categories: ["event_venue"],
      }
    : undefined,
  locked: true,
});

const buildPayload = (item: DiscoveryItem): BucketListPayload => {
  if (
    item.category === "events" ||
    item.type === "event" ||
    item.type === "concert" ||
    item.type === "festival" ||
    item.type === "theatre" ||
    item.type === "opera" ||
    item.type === "exhibition" ||
    item.type === "cinema"
  ) {
    return { type: "event", event: toTripEvent(item) };
  }
  if (
    item.type === "country" ||
    item.type === "city" ||
    item.type === "region" ||
    item.type === "district" ||
    item.type === "neighborhood"
  ) {
    const city = item.location?.city?.trim() || item.title.trim();
    const country = item.location?.country?.trim() || "Unknown country";
    return {
      type: "destination",
      location: {
        city,
        country,
        coordinates: item.location?.coordinates,
      },
    };
  }
  return { type: "place", place: toPlaceCandidate(item) };
};

export const mapDiscoveryItemToBucketItem = (
  item: DiscoveryItem,
  options: MapDiscoveryItemToBucketOptions,
): AddBucketListItemInput => {
  const notes = options.notes?.trim();
  const noteTags = notes ? [`note:${notes}`] : [];
  return {
    userId: options.userId.trim(),
    payload: buildPayload(item),
    category: item.category ? item.category.replace(/_/g, " ") : item.type.replace(/_/g, " "),
    tags: [...item.tags, ...noteTags],
    source: item.source.isFallback ? "recommendation" : "imported",
    priority: options.priority,
    entityId: `${item.source.provider ?? "discovery"}:${item.id}`,
    visited: false,
  };
};

