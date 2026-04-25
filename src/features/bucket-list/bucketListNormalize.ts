import type { PlaceSnapshot } from "../../entities/activity/model";
import type { PlaceCandidate, PlaceProviderId } from "../../services/places/placeTypes";
import type { TripEvent } from "../../services/events/tripEventTypes";
import type { BucketListItem, BucketListItemType, BucketListLocation, BucketListPayload, BucketListSchemaVersion } from "./bucketList.types";

export const placeSnapshotToPlaceCandidate = (p: PlaceSnapshot): PlaceCandidate => {
  const provRaw = p.provider?.trim() ?? "osm";
  const provider: PlaceProviderId = provRaw === "google_places" ? "google_places" : "osm";
  const providerId = p.providerPlaceId?.trim() || `snap:${p.name}`;
  const lat = p.latitude;
  const lng = p.longitude;
  return {
    id: `${provider}:${providerId}`,
    provider,
    providerId,
    name: p.name.trim(),
    city: p.city,
    country: p.country,
    coordinates: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
    categories: [],
  };
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

export const deriveTitleFromPayload = (payload: BucketListPayload): string => {
  switch (payload.type) {
    case "destination":
      return [payload.location.city, payload.location.country].filter(Boolean).join(", ");
    case "place":
      return payload.place.name.trim();
    case "experience":
      return payload.label.trim();
    case "event":
      return payload.event.title.trim();
  }
};

export const deriveLocationMirror = (payload: BucketListPayload): BucketListItem["location"] | undefined => {
  switch (payload.type) {
    case "destination": {
      const c = payload.location.coordinates;
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        return {
          lat: c.lat,
          lng: c.lng,
          city: payload.location.city,
          country: payload.location.country,
        };
      }
      return {
        lat: 0,
        lng: 0,
        city: payload.location.city,
        country: payload.location.country,
      };
    }
    case "place": {
      const p = payload.place;
      const c = p.coordinates;
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        return { lat: c.lat, lng: c.lng, city: p.city, country: p.country };
      }
      return p.city || p.country ? { lat: 0, lng: 0, city: p.city, country: p.country } : undefined;
    }
    case "event": {
      const e = payload.event;
      const c = e.coordinates;
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        return { lat: c.lat, lng: c.lng, city: e.city, country: e.country };
      }
      return e.city || e.country ? { lat: 0, lng: 0, city: e.city, country: e.country } : undefined;
    }
    case "experience":
      return undefined;
  }
};

/** Omit synthetic 0,0 used only for grouping when no coordinates exist. */
export const bucketListItemMapCoordinates = (item: BucketListItem): { lat: number; lng: number } | undefined => {
  const loc = item.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    return undefined;
  }
  if (loc.lat === 0 && loc.lng === 0) {
    return undefined;
  }
  return { lat: loc.lat, lng: loc.lng };
};

export const resolveEntityIdFromPayload = (payload: BucketListPayload, itemId: string, explicit?: string): string | undefined => {
  const ex = explicit?.trim();
  if (ex) {
    return ex;
  }
  switch (payload.type) {
    case "place":
      return `${payload.place.provider}:${payload.place.providerId}`;
    case "destination":
      return `dest:${norm(payload.location.city)}:${norm(payload.location.country)}`;
    case "event":
      return `event:${payload.event.id}`;
    case "experience":
      return undefined;
  }
};

const parsePlaceCandidate = (raw: unknown): PlaceCandidate | null => {
  if (!isRecord(raw)) {
    return null;
  }
  const provider = raw.provider === "google_places" ? "google_places" : "osm";
  const providerId = typeof raw.providerId === "string" ? raw.providerId : "";
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!providerId || !name) {
    return null;
  }
  const coords = isRecord(raw.coordinates) && typeof raw.coordinates.lat === "number" && typeof raw.coordinates.lng === "number"
    ? { lat: raw.coordinates.lat, lng: raw.coordinates.lng }
    : undefined;
  return {
    id: typeof raw.id === "string" ? raw.id : `${provider}:${providerId}`,
    provider: provider as PlaceProviderId,
    providerId,
    name,
    city: typeof raw.city === "string" ? raw.city : undefined,
    country: typeof raw.country === "string" ? raw.country : undefined,
    coordinates: coords,
    categories: Array.isArray(raw.categories) ? (raw.categories.filter((c) => typeof c === "string") as string[]) : [],
  };
};

const parseTripEvent = (raw: unknown): TripEvent | null => {
  if (!isRecord(raw)) {
    return null;
  }
  const id = typeof raw.id === "string" ? raw.id : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  if (!id || !title) {
    return null;
  }
  const mode = raw.mode === "resolved" ? "resolved" : "custom";
  const coords =
    isRecord(raw.coordinates) && typeof raw.coordinates.lat === "number" && typeof raw.coordinates.lng === "number"
      ? { lat: raw.coordinates.lat, lng: raw.coordinates.lng }
      : undefined;
  return {
    id,
    mode,
    title,
    venue: parsePlaceCandidate(raw.venue) ?? undefined,
    city: typeof raw.city === "string" ? raw.city : undefined,
    country: typeof raw.country === "string" ? raw.country : undefined,
    startDateTime: typeof raw.startDateTime === "string" ? raw.startDateTime : undefined,
    endDateTime: typeof raw.endDateTime === "string" ? raw.endDateTime : undefined,
    coordinates: coords,
    locked: true,
  };
};

const parseLocation = (raw: unknown): BucketListLocation | null => {
  if (!isRecord(raw)) {
    return null;
  }
  const city = typeof raw.city === "string" ? raw.city.trim() : "";
  const country = typeof raw.country === "string" ? raw.country.trim() : "";
  if (!city || !country) {
    return null;
  }
  const coords =
    isRecord(raw.coordinates) && typeof raw.coordinates.lat === "number" && typeof raw.coordinates.lng === "number"
      ? { lat: raw.coordinates.lat, lng: raw.coordinates.lng }
      : undefined;
  return { city, country, coordinates: coords };
};

export const parsePayloadFromUnknown = (raw: unknown): BucketListPayload | null => {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return null;
  }
  if (raw.type === "destination") {
    const loc = parseLocation(raw.location);
    return loc ? { type: "destination", location: loc } : null;
  }
  if (raw.type === "place") {
    const place = parsePlaceCandidate(raw.place);
    return place ? { type: "place", place } : null;
  }
  if (raw.type === "experience") {
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    return label ? { type: "experience", label } : null;
  }
  if (raw.type === "event") {
    const event = parseTripEvent(raw.event);
    return event ? { type: "event", event } : null;
  }
  return null;
};

const migrateLegacyPayload = (id: string, raw: Record<string, unknown>): BucketListPayload => {
  const title = typeof raw.title === "string" ? raw.title.trim() : "Saved item";
  const legacyType = (raw.type as BucketListItemType | undefined) ?? "custom";
  const loc = isRecord(raw.location) ? raw.location : undefined;
  const lat = loc && typeof loc.lat === "number" ? loc.lat : undefined;
  const lng = loc && typeof loc.lng === "number" ? loc.lng : undefined;
  const city = loc && typeof loc.city === "string" ? loc.city.trim() : "";
  const country = loc && typeof loc.country === "string" ? loc.country.trim() : "";
  const entityId = typeof raw.entityId === "string" ? raw.entityId.trim() : "";

  if (legacyType === "experience" || legacyType === "custom") {
    return { type: "experience", label: title || "Wish" };
  }
  if (legacyType === "event") {
    return {
      type: "event",
      event: {
        id: entityId || id,
        mode: "custom",
        title: title || "Event",
        city: city || undefined,
        country: country || undefined,
        coordinates: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
        locked: true,
      },
    };
  }
  if (legacyType === "place") {
    if (entityId.includes(":") && lat !== undefined && lng !== undefined) {
      const idx = entityId.indexOf(":");
      const prov = entityId.slice(0, idx);
      const restId = entityId.slice(idx + 1);
      const provider: PlaceProviderId = prov === "google_places" ? "google_places" : "osm";
      const providerId = restId || `legacy:${id}`;
      return {
        type: "place",
        place: {
          id: `${provider}:${providerId}`,
          provider,
          providerId,
          name: title,
          city: city || undefined,
          country: country || undefined,
          coordinates: { lat: lat!, lng: lng! },
          categories: ["migrated"],
        },
      };
    }
    if (city && country) {
      return {
        type: "destination",
        location: {
          city,
          country,
          coordinates: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
        },
      };
    }
    if (lat !== undefined && lng !== undefined) {
      return {
        type: "place",
        place: {
          id: `osm:legacy:${id}`,
          provider: "osm",
          providerId: `legacy:${id}`,
          name: title,
          city: city || undefined,
          country: country || undefined,
          coordinates: { lat, lng },
          categories: ["migrated"],
        },
      };
    }
  }
  return { type: "experience", label: title || "Wish" };
};

export const ensureDenormalized = (item: BucketListItem): BucketListItem => {
  const title = item.title.trim() || deriveTitleFromPayload(item.payload);
  const location = item.location ?? deriveLocationMirror(item.payload);
  const entityId = item.entityId?.trim() || resolveEntityIdFromPayload(item.payload, item.id) || undefined;
  return {
    ...item,
    title,
    location,
    entityId,
  };
};

export const bucketListItemCityCountry = (item: BucketListItem): { city?: string; country?: string } => {
  switch (item.payload.type) {
    case "destination":
      return { city: item.payload.location.city, country: item.payload.location.country };
    case "place":
      return { city: item.payload.place.city, country: item.payload.place.country };
    case "event":
      return { city: item.payload.event.city, country: item.payload.event.country };
    case "experience":
      return {};
  }
};

export const bucketListFeasibilityScore = (item: BucketListItem): number => {
  switch (item.payload.type) {
    case "destination":
      return item.payload.location.city && item.payload.location.country ? 0.95 : 0.55;
    case "place":
      return item.payload.place.coordinates ? 0.92 : item.payload.place.country ? 0.78 : 0.52;
    case "event":
      return item.payload.event.startDateTime && item.payload.event.city ? 0.88 : item.payload.event.city ? 0.66 : 0.44;
    case "experience":
      return 0.4;
  }
};

export const bucketListItemToPlanningPlaceSnapshot = (item: BucketListItem): PlaceSnapshot => {
  const capturedAt = item.updatedAt || item.createdAt;
  const base: PlaceSnapshot = {
    provider: "bucket_list",
    providerPlaceId: item.entityId?.trim() || `bucket:${item.id}`,
    name: item.title.trim(),
    capturedAt,
    planningSource: "bucket_list",
    bucketListItemId: item.id,
  };
  switch (item.payload.type) {
    case "destination": {
      const l = item.payload.location;
      const c = l.coordinates;
      return {
        ...base,
        name: item.title,
        city: l.city,
        country: l.country,
        latitude: c?.lat,
        longitude: c?.lng,
      };
    }
    case "place": {
      const p = item.payload.place;
      return {
        ...base,
        provider: p.provider,
        providerPlaceId: `${p.provider}:${p.providerId}`,
        name: p.name,
        city: p.city,
        country: p.country,
        latitude: p.coordinates?.lat,
        longitude: p.coordinates?.lng,
      };
    }
    case "event": {
      const e = item.payload.event;
      return {
        ...base,
        name: e.title,
        city: e.city,
        country: e.country,
        latitude: e.coordinates?.lat ?? e.venue?.coordinates?.lat,
        longitude: e.coordinates?.lng ?? e.venue?.coordinates?.lng,
      };
    }
    case "experience":
      return {
        ...base,
        name: item.payload.label,
      };
  }
};

export const parseBucketListDocument = (id: string, raw: unknown, expectedUserId: string, timestampToIso: (v: unknown) => string): BucketListItem | null => {
  if (!isRecord(raw)) {
    return null;
  }
  const userId = typeof raw.userId === "string" ? raw.userId : "";
  if (userId !== expectedUserId) {
    return null;
  }
  const source = raw.source as BucketListItem["source"];
  const priority = raw.priority as BucketListItem["priority"];
  if (!source || !priority) {
    return null;
  }

  const schemaVersion = raw.schemaVersion === 2 ? 2 : 1;
  let payload: BucketListPayload | null = null;
  if (schemaVersion === 2) {
    payload = parsePayloadFromUnknown(raw.payload);
  }
  if (!payload) {
    payload = migrateLegacyPayload(id, raw);
  }

  const touchCountRaw = typeof raw.touchCount === "number" && Number.isFinite(raw.touchCount) ? Math.floor(raw.touchCount) : 0;
  const touchCount = touchCountRaw > 0 ? touchCountRaw : 1;
  const lastTouchedAt =
    typeof raw.lastTouchedAt === "string" && raw.lastTouchedAt.trim()
      ? raw.lastTouchedAt
      : typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : timestampToIso(raw.lastTouchedAt ?? raw.updatedAt);

  const core = {
    id,
    userId,
    schemaVersion: 2 as BucketListSchemaVersion,
    payload,
    category: typeof raw.category === "string" ? raw.category : undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags.filter((t) => typeof t === "string") as string[]) : undefined,
    source,
    priority,
    visited: Boolean(raw.visited),
    visitedAt: typeof raw.visitedAt === "string" ? raw.visitedAt : timestampToIso(raw.visitedAt),
    touchCount,
    lastTouchedAt,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : timestampToIso(raw.createdAt),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : timestampToIso(raw.updatedAt),
    entityId: typeof raw.entityId === "string" ? raw.entityId : undefined,
    title: typeof raw.title === "string" ? raw.title : "",
  };

  return ensureDenormalized(core as BucketListItem);
};

export const serializeBucketListDocument = (item: BucketListItem): Record<string, unknown> => {
  const denorm = ensureDenormalized(item);
  const out: Record<string, unknown> = {
    schemaVersion: 2,
    userId: denorm.userId,
    title: denorm.title,
    payload: denorm.payload,
    source: denorm.source,
    priority: denorm.priority,
    visited: denorm.visited,
    createdAt: denorm.createdAt,
    updatedAt: denorm.updatedAt,
    touchCount: denorm.touchCount,
    lastTouchedAt: denorm.lastTouchedAt,
  };
  if (denorm.entityId !== undefined) {
    out.entityId = denorm.entityId;
  }
  if (denorm.location !== undefined) {
    out.location = denorm.location;
  }
  if (denorm.category !== undefined) {
    out.category = denorm.category;
  }
  if (denorm.tags !== undefined) {
    out.tags = denorm.tags;
  }
  if (denorm.visitedAt !== undefined) {
    out.visitedAt = denorm.visitedAt;
  }
  return out;
};
