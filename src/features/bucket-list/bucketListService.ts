import { nowIso } from "../../services/firebase/timestampMapper";
import { invalidateTravelAnalyticsCache } from "../analytics/analyticsRepository";
import { achievementTriggers } from "../achievements/achievementTriggers";
import { enrichPlace } from "../places/enrichment/enrichPlace";
import type { PlaceEnrichmentContribution } from "../places/enrichment/placeEnrichment.types";
import type { AddBucketListItemInput, BucketListItem } from "./bucketList.types";
import { bucketListFuzzyMergeKey } from "./bucketListDedupe";
import { bucketListRepository } from "./bucketListRepository";
import {
  bucketListItemMapCoordinates,
  ensureDenormalized,
  resolveEntityIdFromPayload,
} from "./bucketListNormalize";

const newId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const priorityRank: Record<BucketListItem["priority"], number> = { high: 3, medium: 2, low: 1 };

const mergeHigherPriority = (a: BucketListItem["priority"], b: BucketListItem["priority"]): BucketListItem["priority"] =>
  priorityRank[a] >= priorityRank[b] ? a : b;

const previewFromInput = (userId: string, input: AddBucketListItemInput, id: string, now: string): BucketListItem =>
  ensureDenormalized({
    id,
    userId: userId.trim(),
    schemaVersion: 2,
    payload: input.payload,
    title: "",
    entityId: input.entityId?.trim() || resolveEntityIdFromPayload(input.payload, id) || undefined,
    location: undefined,
    category: input.category,
    tags: input.tags,
    source: input.source,
    priority: input.priority,
    visited: input.visited ?? false,
    visitedAt: input.visitedAt,
    touchCount: 1,
    lastTouchedAt: now,
    createdAt: now,
    updatedAt: now,
  });

const seedContributionFromItem = (item: BucketListItem): PlaceEnrichmentContribution => {
  const coords = bucketListItemMapCoordinates(item);
  const canonical =
    item.payload.type === "place"
      ? item.payload.place.name
      : item.payload.type === "destination"
        ? item.payload.location.city
        : item.title.trim();
  return {
    contributionId: `bucket-list:${item.id}`,
    sourceKind: "unknown",
    defaultFactualReliability: "low",
    partial: {
      canonicalName: canonical,
      coordinates: coords,
      category: item.category,
    },
  };
};

/**
 * Runs the place enrichment merge when an {@link BucketListItem.entityId} exists (Rule 3).
 * Uses `entityId` as {@link enrichPlace} cache key; safe with partial rows (Rule 2).
 */
export const runEnrichmentForBucketListItem = (item: BucketListItem): void => {
  const key = item.entityId?.trim();
  if (!key) {
    return;
  }
  enrichPlace({
    cacheKey: key,
    enrichedPlaceId: key,
    contributions: [seedContributionFromItem(item)],
    forceRefresh: false,
  });
};

const notifyAchievements = (userId: string): void => {
  invalidateTravelAnalyticsCache(userId.trim());
  void achievementTriggers.onBucketListProgressMayHaveChanged(userId);
};

export const bucketListService = {
  /**
   * Adds a new row or merges into an existing one by `entityId` or fuzzy title/label (Rule 7).
   */
  addOrUpdateItem: async (userId: string, input: AddBucketListItemInput): Promise<BucketListItem> => {
    const uid = userId.trim();
    if (!uid) {
      throw new TypeError("userId is required.");
    }
    const now = nowIso();
    const candidateId = input.id?.trim() || newId();
    const dedupeEntity = input.entityId?.trim() || resolveEntityIdFromPayload(input.payload, candidateId);

    if (dedupeEntity) {
      const existing = await bucketListRepository.findByEntityId(uid, dedupeEntity);
      if (existing) {
        const merged = ensureDenormalized({
          ...existing,
          payload: input.payload,
          category: input.category ?? existing.category,
          tags: [...new Set([...(existing.tags ?? []), ...(input.tags ?? [])])],
          source: existing.source === "manual" ? existing.source : input.source,
          priority: mergeHigherPriority(existing.priority, input.priority),
          touchCount: existing.touchCount + 1,
          lastTouchedAt: now,
          updatedAt: now,
        });
        await bucketListRepository.save(merged);
        if (merged.entityId) {
          runEnrichmentForBucketListItem(merged);
        }
        notifyAchievements(uid);
        return merged;
      }
    }

    const all = await bucketListRepository.listByUserId(uid);
    const preview = previewFromInput(uid, input, candidateId, now);
    const fKey = bucketListFuzzyMergeKey(preview);
    const fuzzyDup = all.find((row) => !row.entityId?.trim() && !dedupeEntity && bucketListFuzzyMergeKey(row) === fKey);
    if (fuzzyDup) {
      const merged = ensureDenormalized({
        ...fuzzyDup,
        entityId: dedupeEntity || fuzzyDup.entityId,
        payload: input.payload,
        category: input.category ?? fuzzyDup.category,
        tags: [...new Set([...(fuzzyDup.tags ?? []), ...(input.tags ?? [])])],
        priority: mergeHigherPriority(fuzzyDup.priority, input.priority),
        touchCount: fuzzyDup.touchCount + 1,
        lastTouchedAt: now,
        updatedAt: now,
      });
      await bucketListRepository.save(merged);
      if (merged.entityId) {
        runEnrichmentForBucketListItem(merged);
      }
      notifyAchievements(uid);
      return merged;
    }

    const id = candidateId;
    const created = previewFromInput(uid, input, id, now);
    await bucketListRepository.save(created);
    if (created.entityId) {
      runEnrichmentForBucketListItem(created);
    }
    notifyAchievements(uid);
    return created;
  },

  /** Rule 6 — manual toggle; does not delete the row (Rule 5). */
  setVisited: async (userId: string, itemId: string, visited: boolean): Promise<BucketListItem | null> => {
    const row = await bucketListRepository.getById(userId, itemId);
    if (!row) {
      return null;
    }
    const now = nowIso();
    const next = ensureDenormalized({
      ...row,
      visited,
      visitedAt: visited ? now : undefined,
      updatedAt: now,
    });
    await bucketListRepository.save(next);
    notifyAchievements(userId.trim());
    return next;
  },

  /** Rule 4 — auto visit when matched during a trip (caller supplies matching item id). */
  markVisitedFromTrip: async (userId: string, itemId: string): Promise<BucketListItem | null> => {
    const row = await bucketListRepository.getById(userId, itemId);
    if (!row || row.visited) {
      return row;
    }
    const now = nowIso();
    const next = ensureDenormalized({
      ...row,
      visited: true,
      visitedAt: now,
      updatedAt: now,
    });
    await bucketListRepository.save(next);
    notifyAchievements(userId.trim());
    return next;
  },

  /**
   * Partial update — when `payload` is set it replaces the structured entry and recomputes denormalized fields.
   */
  patchItem: async (
    userId: string,
    itemId: string,
    patch: Partial<Pick<BucketListItem, "title" | "location" | "category" | "tags" | "priority" | "entityId" | "payload">>,
  ): Promise<BucketListItem | null> => {
    const row = await bucketListRepository.getById(userId.trim(), itemId.trim());
    if (!row) {
      return null;
    }
    const now = nowIso();
    const base: BucketListItem = {
      ...row,
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : row.title,
      entityId: patch.entityId !== undefined ? patch.entityId?.trim() || undefined : row.entityId,
      updatedAt: now,
    };
    const next = patch.payload !== undefined ? ensureDenormalized({ ...base, payload: patch.payload }) : ensureDenormalized(base);
    await bucketListRepository.save(next);
    if (next.entityId) {
      runEnrichmentForBucketListItem(next);
    }
    notifyAchievements(userId.trim());
    return next;
  },

  list: bucketListRepository.listByUserId,
  get: bucketListRepository.getById,
  remove: async (userId: string, itemId: string): Promise<void> => {
    await bucketListRepository.delete(userId, itemId);
    notifyAchievements(userId.trim());
  },
};
