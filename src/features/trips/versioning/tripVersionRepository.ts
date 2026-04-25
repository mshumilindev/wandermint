import type { TripVersion } from "./tripVersion.types";

const STORAGE_KEY = "wandermint.tripVersions.v1";

/** Cap versions per trip to bound localStorage (Rule 3). */
export const MAX_TRIP_VERSIONS_PER_TRIP = 40;

type TripVersionsStoreV1 = {
  v: 1;
  items: TripVersion[];
};

const emptyStore = (): TripVersionsStoreV1 => ({ v: 1, items: [] });

const readStore = (): TripVersionsStoreV1 => {
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
    const items = (parsed as TripVersionsStoreV1).items;
    if (!Array.isArray(items)) {
      return emptyStore();
    }
    return { v: 1, items: items.filter(isTripVersionRow) };
  } catch {
    return emptyStore();
  }
};

const isTripVersionRow = (row: unknown): row is TripVersion => {
  if (!row || typeof row !== "object") {
    return false;
  }
  const v = row as TripVersion;
  return (
    typeof v.id === "string" &&
    typeof v.tripId === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.reason === "string" &&
    v.snapshot !== null &&
    typeof v.snapshot === "object" &&
    typeof (v.snapshot as { id?: string }).id === "string"
  );
};

const writeStore = (store: TripVersionsStoreV1): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode
  }
};

const trimVersionsForTrip = (versions: TripVersion[], tripId: string): TripVersion[] => {
  const forTrip = versions.filter((v) => v.tripId === tripId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rest = versions.filter((v) => v.tripId !== tripId);
  while (forTrip.length > MAX_TRIP_VERSIONS_PER_TRIP) {
    forTrip.shift();
  }
  return [...rest, ...forTrip];
};

/**
 * Persisted trip snapshots for undo (separate from Firestore trip documents).
 */
export const tripVersionRepository = {
  listForTrip: async (tripId: string): Promise<TripVersion[]> => {
    if (!tripId.trim()) {
      return [];
    }
    return readStore()
      .items.filter((v) => v.tripId === tripId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getById: async (versionId: string): Promise<TripVersion | null> => {
    if (!versionId.trim()) {
      return null;
    }
    return readStore().items.find((v) => v.id === versionId) ?? null;
  },

  /**
   * Appends a version and enforces {@link MAX_TRIP_VERSIONS_PER_TRIP} for that trip (oldest dropped).
   */
  append: async (version: TripVersion): Promise<void> => {
    const store = readStore();
    const withoutNew = store.items.filter((v) => v.id !== version.id);
    const merged = trimVersionsForTrip([...withoutNew, version], version.tripId);
    writeStore({ v: 1, items: merged });
  },

  deleteForTrip: async (tripId: string): Promise<void> => {
    const store = readStore();
    writeStore({ v: 1, items: store.items.filter((v) => v.tripId !== tripId) });
  },
};

export const clearTripVersionRepositoryForTests = (): void => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
};
