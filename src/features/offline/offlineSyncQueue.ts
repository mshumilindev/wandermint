import type { ActivityCompletionStatus } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import { createClientId } from "../../shared/lib/id";
import { completionHistoryRepository } from "../../services/firebase/repositories/completionHistoryRepository";
import { tripDaysRepository } from "../../services/firebase/repositories/tripDaysRepository";
import { ANALYTICS_EVENTS } from "../observability/analyticsEvents";
import { achievementTriggers } from "../achievements/achievementTriggers";
import { logAnalyticsEvent } from "../observability/appLogger";

const QUEUE_KEY = "wandermint:v1:offlineSyncQueue";

export type OfflineActivityCompletionMutation = {
  id: string;
  type: "activity_completion";
  userId: string;
  tripId: string;
  dayId: string;
  blockId: string;
  status: ActivityCompletionStatus;
  previousStatus: ActivityCompletionStatus;
  clientTimestamp: number;
};

export type OfflineSaveDayPlanMutation = {
  id: string;
  type: "save_day_plan";
  tripId: string;
  dayPlan: DayPlan;
  clientTimestamp: number;
};

export type OfflineMutation = OfflineActivityCompletionMutation | OfflineSaveDayPlanMutation;

const readRawQueue = (): OfflineMutation[] => {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as OfflineMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (items: OfflineMutation[]): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
};

const dedupeEnqueue = (queue: OfflineMutation[], next: OfflineMutation): OfflineMutation[] => {
  if (next.type === "activity_completion") {
    const filtered = queue.filter(
      (item) =>
        !(
          item.type === "activity_completion" &&
          item.tripId === next.tripId &&
          item.dayId === next.dayId &&
          item.blockId === next.blockId
        ),
    );
    return [...filtered, next].sort((a, b) => a.clientTimestamp - b.clientTimestamp);
  }
  if (next.type === "save_day_plan") {
    const filtered = queue.filter((item) => !(item.type === "save_day_plan" && item.tripId === next.tripId && item.dayPlan.id === next.dayPlan.id));
    return [...filtered, next].sort((a, b) => a.clientTimestamp - b.clientTimestamp);
  }
  return [...queue, next];
};

export const enqueueOfflineMutation = (mutation: Omit<OfflineActivityCompletionMutation, "id" | "clientTimestamp" | "type">): void => {
  const full: OfflineActivityCompletionMutation = {
    ...mutation,
    type: "activity_completion",
    id: createClientId("offline_mut"),
    clientTimestamp: Date.now(),
  };
  writeQueue(dedupeEnqueue(readRawQueue(), full));
};

export const enqueueOfflineSaveDayPlan = (mutation: Omit<OfflineSaveDayPlanMutation, "id" | "clientTimestamp" | "type">): void => {
  const full: OfflineSaveDayPlanMutation = {
    ...mutation,
    type: "save_day_plan",
    id: createClientId("offline_day"),
    clientTimestamp: Date.now(),
  };
  writeQueue(dedupeEnqueue(readRawQueue(), full));
};

export const peekOfflineQueue = (): OfflineMutation[] => readRawQueue();

export const clearOfflineQueue = (): void => {
  writeQueue([]);
};

/**
 * Applies queued mutations to Firestore. Completion updates use repository read-merge-write so the
 * latest queued status for a block wins over stale server block state. Does not touch trip root metadata.
 */
export const drainOfflineSyncQueue = async (): Promise<{ applied: number; failed: number; affectedTripIds: string[] }> => {
  const queue = readRawQueue();
  if (queue.length === 0) {
    return { applied: 0, failed: 0, affectedTripIds: [] };
  }

  let applied = 0;
  let failed = 0;
  const failedByMutationType: Record<string, number> = {};
  const remaining: OfflineMutation[] = [];
  const affectedTripIds = new Set<string>();
  const lastActivityCompletionByUser = new Map<string, { tripId: string; dayId: string; blockId: string }>();

  const sorted = [...queue].sort((a, b) => a.clientTimestamp - b.clientTimestamp);

  for (const op of sorted) {
    try {
      if (op.type === "activity_completion") {
        await tripDaysRepository.updateActivityCompletion(op.tripId, op.dayId, op.blockId, op.status);
        await completionHistoryRepository.recordCompletionChange({
          id: createClientId("completion"),
          userId: op.userId,
          tripId: op.tripId,
          dayId: op.dayId,
          blockId: op.blockId,
          previousStatus: op.previousStatus,
          nextStatus: op.status,
          createdAt: new Date().toISOString(),
        });
        affectedTripIds.add(op.tripId);
        lastActivityCompletionByUser.set(op.userId, { tripId: op.tripId, dayId: op.dayId, blockId: op.blockId });
        applied += 1;
      } else if (op.type === "save_day_plan") {
        await tripDaysRepository.saveTripDay(op.dayPlan);
        affectedTripIds.add(op.tripId);
        applied += 1;
      }
    } catch {
      failed += 1;
      failedByMutationType[op.type] = (failedByMutationType[op.type] ?? 0) + 1;
      remaining.push(op);
    }
  }

  writeQueue(remaining);
  for (const [userId, meta] of lastActivityCompletionByUser) {
    void achievementTriggers.onActivityCompletionMayHaveChanged(userId, meta);
  }
  if (failed > 0) {
    logAnalyticsEvent(ANALYTICS_EVENTS.offline_sync_failed, {
      failed,
      applied,
      failedByMutationType,
      remainingQueueDepth: remaining.length,
      affectedTripCount: affectedTripIds.size,
    });
  }
  return { applied, failed, affectedTripIds: [...affectedTripIds] };
};
