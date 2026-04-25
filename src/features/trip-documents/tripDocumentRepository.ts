import type { TripDocument, TripDocumentOfflineMeta } from "./tripDocument.types";

const STORAGE_KEY = "wandermint.tripDocuments.v1";

type TripDocumentsStoreV1 = {
  v: 1;
  items: TripDocument[];
};

const emptyStore = (): TripDocumentsStoreV1 => ({ v: 1, items: [] });

const isTripDocumentRow = (row: unknown): row is TripDocument => {
  if (!row || typeof row !== "object") {
    return false;
  }
  const d = row as TripDocument;
  return (
    typeof d.id === "string" &&
    typeof d.tripId === "string" &&
    typeof d.type === "string" &&
    typeof d.createdAt === "string" &&
    (d.itemId === undefined || typeof d.itemId === "string") &&
    (d.fileUrl === undefined || typeof d.fileUrl === "string") &&
    (d.textContent === undefined || typeof d.textContent === "string") &&
    (d.displayName === undefined || typeof d.displayName === "string") &&
    (d.mimeType === undefined || typeof d.mimeType === "string")
  );
};

const readStore = (): TripDocumentsStoreV1 => {
  if (typeof localStorage === "undefined") {
    return emptyStore();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyStore();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("items" in parsed)) {
      return emptyStore();
    }
    const items = (parsed as TripDocumentsStoreV1).items;
    if (!Array.isArray(items)) {
      return emptyStore();
    }
    return { v: 1, items: items.filter(isTripDocumentRow) };
  } catch {
    return emptyStore();
  }
};

const writeStore = (store: TripDocumentsStoreV1): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode
  }
};

const sortByCreatedAtAsc = (a: TripDocument, b: TripDocument): number => a.createdAt.localeCompare(b.createdAt);

const tripLevelTypesForLive: ReadonlySet<TripDocument["type"]> = new Set(["ticket", "hotel", "reservation", "pdf"]);

/**
 * Strips binary-heavy fields only when building offline metadata; never reads file bytes.
 */
export const toOfflineDocumentMeta = (doc: TripDocument, options?: { omitText?: boolean }): TripDocumentOfflineMeta => {
  const text =
    options?.omitText && doc.textContent && doc.textContent.length > 4_000 ? undefined : doc.textContent;
  return {
    id: doc.id,
    tripId: doc.tripId,
    itemId: doc.itemId,
    type: doc.type,
    createdAt: doc.createdAt,
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    fileUrl: doc.fileUrl,
    textContent: text,
  };
};

/**
 * For live execution: item-specific docs first (most relevant), then trip-level
 * tickets / hotels / reservations / PDFs (Rule 2 — surface before the item row).
 */
export const selectDocumentsToSurfaceBeforeItem = (tripId: string, itemId: string, all: readonly TripDocument[]): TripDocument[] => {
  const tid = tripId.trim();
  const iid = itemId.trim();
  if (!tid || !iid) {
    return [];
  }
  const forItem = all.filter((d) => d.tripId === tid && d.itemId === iid).sort(sortByCreatedAtAsc);
  const tripLevel = all
    .filter((d) => d.tripId === tid && (d.itemId === undefined || d.itemId.trim() === "") && tripLevelTypesForLive.has(d.type))
    .sort(sortByCreatedAtAsc);
  return [...forItem, ...tripLevel];
};

/** Synchronous metadata read for {@link persistActiveTripOfflineBundle} (Rule 3). */
export const listTripDocumentsMetadataForOfflineSync = (tripId: string): TripDocumentOfflineMeta[] => {
  if (!tripId.trim()) {
    return [];
  }
  return readStore()
    .items.filter((d) => d.tripId === tripId)
    .map((d) => toOfflineDocumentMeta(d, { omitText: true }));
};

export const tripDocumentRepository = {
  listByTripId: async (tripId: string): Promise<TripDocument[]> => {
    if (!tripId.trim()) {
      return [];
    }
    return readStore()
      .items.filter((d) => d.tripId === tripId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  listByTripAndItemId: async (tripId: string, itemId: string): Promise<TripDocument[]> => {
    if (!tripId.trim() || !itemId.trim()) {
      return [];
    }
    return readStore()
      .items.filter((d) => d.tripId === tripId && d.itemId === itemId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getById: async (documentId: string): Promise<TripDocument | null> => {
    if (!documentId.trim()) {
      return null;
    }
    return readStore().items.find((d) => d.id === documentId) ?? null;
  },

  save: async (doc: TripDocument): Promise<void> => {
    const store = readStore();
    const next = store.items.filter((d) => d.id !== doc.id);
    next.push(doc);
    writeStore({ v: 1, items: next });
  },

  delete: async (documentId: string): Promise<void> => {
    const store = readStore();
    writeStore({ v: 1, items: store.items.filter((d) => d.id !== documentId) });
  },

  deleteAllForTrip: async (tripId: string): Promise<void> => {
    if (!tripId.trim()) {
      return;
    }
    const store = readStore();
    writeStore({ v: 1, items: store.items.filter((d) => d.tripId !== tripId) });
  },
};

export const clearTripDocumentRepositoryForTests = (): void => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
};
