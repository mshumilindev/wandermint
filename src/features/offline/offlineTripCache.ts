import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import type { TripDocumentOfflineMeta } from "../trip-documents/tripDocument.types";
import { listTripDocumentsMetadataForOfflineSync } from "../trip-documents/tripDocumentRepository";

const CACHE_KEY = "wandermint:v1:activeTripOffline";
const SCHEMA_VERSION = 1;
const MAX_BYTES_SOFT = 4_500_000;

export type OfflineTripExecutionSnapshot = {
  /** ISO time when this snapshot was written (client clock). */
  savedAt: string;
  /** Per-day completion-style execution hints (block ids). */
  completedBlockIdsByDay: Record<string, string[]>;
  skippedBlockIdsByDay: Record<string, string[]>;
};

export type OfflineTripBundle = {
  schemaVersion: number;
  tripId: string;
  userId: string;
  savedAt: string;
  trip: Trip;
  dayPlans: DayPlan[];
  dayIdsOrdered: string[];
  /** Image URLs seen for this trip (HTTP(S)); browser cache may still serve them offline. */
  loadedImageUrls: string[];
  /** Trip-level text notes from preferences. */
  tripNotes?: {
    mustSeeNotes: string;
    specialWishes: string;
  };
  /** Ticket / hotel / PDF metadata for offline live mode (no file parsing). */
  tripDocumentsMetadata?: TripDocumentOfflineMeta[];
  executionSnapshot?: OfflineTripExecutionSnapshot;
};

const collectImageUrlsFromBlocks = (blocks: ActivityBlock[]): string[] => {
  const urls: string[] = [];
  for (const block of blocks) {
    const n = block.normalizedTripPlanItem;
    if (n?.imageUrl && n.imageUrl.startsWith("http")) {
      urls.push(n.imageUrl);
    }
  }
  return urls;
};

export const collectImageUrlsFromTripAndDays = (trip: Trip, days: DayPlan[]): string[] => {
  const set = new Set<string>();
  for (const event of trip.anchorEvents ?? []) {
    if (event.imageUrl?.startsWith("http")) {
      set.add(event.imageUrl);
    }
  }
  for (const day of days) {
    for (const url of collectImageUrlsFromBlocks(day.blocks)) {
      set.add(url);
    }
  }
  return [...set];
};

const executionFromDays = (days: DayPlan[]): OfflineTripExecutionSnapshot => {
  const completedBlockIdsByDay: Record<string, string[]> = {};
  const skippedBlockIdsByDay: Record<string, string[]> = {};
  for (const day of days) {
    completedBlockIdsByDay[day.id] = day.blocks.filter((b) => b.completionStatus === "done").map((b) => b.id);
    skippedBlockIdsByDay[day.id] = day.blocks.filter((b) => b.completionStatus === "skipped").map((b) => b.id);
  }
  return { savedAt: new Date().toISOString(), completedBlockIdsByDay, skippedBlockIdsByDay };
};

const pruneIfHuge = (bundle: OfflineTripBundle): OfflineTripBundle => {
  let json = JSON.stringify(bundle);
  if (json.length <= MAX_BYTES_SOFT) {
    return bundle;
  }
  const trimmed: OfflineTripBundle = {
    ...bundle,
    loadedImageUrls: bundle.loadedImageUrls.slice(0, 40),
    tripDocumentsMetadata: bundle.tripDocumentsMetadata?.slice(0, 60),
  };
  json = JSON.stringify(trimmed);
  if (json.length > MAX_BYTES_SOFT) {
    return { ...trimmed, loadedImageUrls: [], tripDocumentsMetadata: trimmed.tripDocumentsMetadata?.slice(0, 24) };
  }
  return trimmed;
};

export const persistActiveTripOfflineBundle = (input: {
  trip: Trip;
  dayPlans: DayPlan[];
  dayIdsOrdered: string[];
  extraImageUrls?: string[];
  /** When set, overrides automatic trip-document metadata capture for this trip. */
  tripDocumentsMetadata?: TripDocumentOfflineMeta[];
}): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  const existing = readActiveTripOfflineBundle();
  const mergedImages = new Set<string>([...collectImageUrlsFromTripAndDays(input.trip, input.dayPlans), ...(input.extraImageUrls ?? [])]);
  if (existing && existing.tripId === input.trip.id) {
    for (const u of existing.loadedImageUrls) {
      mergedImages.add(u);
    }
  }

  const mergedDocMeta =
    input.tripDocumentsMetadata ??
    (() => {
      const fresh = listTripDocumentsMetadataForOfflineSync(input.trip.id);
      if (existing && existing.tripId === input.trip.id && existing.tripDocumentsMetadata?.length) {
        const byId = new Map<string, TripDocumentOfflineMeta>();
        for (const row of existing.tripDocumentsMetadata) {
          byId.set(row.id, row);
        }
        for (const row of fresh) {
          byId.set(row.id, row);
        }
        return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
      return fresh;
    })();

  const bundle: OfflineTripBundle = pruneIfHuge({
    schemaVersion: SCHEMA_VERSION,
    tripId: input.trip.id,
    userId: input.trip.userId,
    savedAt: new Date().toISOString(),
    trip: input.trip,
    dayPlans: input.dayPlans,
    dayIdsOrdered: input.dayIdsOrdered,
    loadedImageUrls: [...mergedImages],
    tripNotes: {
      mustSeeNotes: input.trip.preferences.mustSeeNotes,
      specialWishes: input.trip.preferences.specialWishes,
    },
    tripDocumentsMetadata: mergedDocMeta,
    executionSnapshot: executionFromDays(input.dayPlans),
  });

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
  } catch {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...bundle, loadedImageUrls: [] }));
    } catch {
      // ignore quota / private mode
    }
  }
};

export const readActiveTripOfflineBundle = (): OfflineTripBundle | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as OfflineTripBundle;
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !parsed.tripId || !parsed.trip || !Array.isArray(parsed.dayPlans)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearActiveTripOfflineBundle = (): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(CACHE_KEY);
};

/** Optional: warm Cache Storage for a few image URLs (best-effort). */
export const precacheImageUrls = async (urls: string[]): Promise<void> => {
  if (typeof caches === "undefined" || typeof fetch === "undefined") {
    return;
  }
  const cacheName = "wandermint-trip-images-v1";
  try {
    const cache = await caches.open(cacheName);
    await Promise.all(
      urls.slice(0, 12).map(async (url) => {
        try {
          const hit = await cache.match(url);
          if (hit) {
            return;
          }
          const res = await fetch(url, { mode: "cors", credentials: "omit" });
          if (res.ok) {
            await cache.put(url, res.clone());
          }
        } catch {
          // ignore single URL failures
        }
      }),
    );
  } catch {
    // ignore
  }
};
