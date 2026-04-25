import type { FlickSyncLibraryItem, FlickSyncMediaType } from "../../entities/flicksync/model";

const asBool = (value: unknown): boolean | undefined => {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
};

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * Normalises a Firestore `profiles/{uid}/library/{itemId}` document into {@link FlickSyncLibraryItem}.
 * Unknown fields are preserved only where typed on the model.
 */
export const mapFlickSyncLibraryDocument = (docId: string, raw: Record<string, unknown>): FlickSyncLibraryItem | null => {
  const provider = asString(raw.provider) ?? "";
  const sourceId = asString(raw.sourceId) ?? "";
  const mediaTypeRaw = asString(raw.mediaType) ?? "movie";
  const title = asString(raw.title)?.trim() ?? "";

  if (!title || !provider || !sourceId) {
    return null;
  }

  const mediaType = mediaTypeRaw as FlickSyncMediaType;

  return {
    id: asString(raw.id) ?? docId,
    provider,
    sourceId,
    mediaType,
    title,
    description: asString(raw.description),
    imageUrl: asString(raw.imageUrl),
    externalRating: asNumber(raw.externalRating),
    released: asBool(raw.released),
    releaseDate: asString(raw.releaseDate),
    isFavourite: asBool(raw.isFavourite),
    isWishlisted: asBool(raw.isWishlisted),
    consumed: asBool(raw.consumed),
    consumeCount: asNumber(raw.consumeCount),
    abandoned: asBool(raw.abandoned),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    seasons: raw.seasons,
    platforms: raw.platforms,
  };
};
