/**
 * Canonical product analytics / observability event names and payload contracts.
 * Payloads must stay structured (counts, enums, opaque ids) — never raw user-entered prose.
 */

export const ANALYTICS_EVENTS = {
  ai_flow_failed: "ai_flow_failed",
  ai_response_invalid: "ai_response_invalid",
  trip_timeline_infeasible: "trip_timeline_infeasible",
  replan_triggered: "replan_triggered",
  item_skipped: "item_skipped",
  item_completed: "item_completed",
  event_match_low_confidence: "event_match_low_confidence",
  image_resolution_failed: "image_resolution_failed",
  opening_hours_unknown: "opening_hours_unknown",
  budget_suspicious: "budget_suspicious",
  offline_sync_failed: "offline_sync_failed",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Typed metadata per event (no free-form user copy, no precise coordinates). */
export type AnalyticsEventMeta = {
  ai_flow_failed: {
    errorKind: string;
    flow?: string;
    statusCode?: number;
    errorCode?: string;
    userIdPresent?: boolean;
  };
  ai_response_invalid: {
    flow: string;
    endpoint: string;
    attempt: number;
    issuePathCount: number;
    issueCodeCount: number;
    topIssuePaths?: readonly string[];
    topIssueCodes?: readonly string[];
  };
  trip_timeline_infeasible: {
    dayId: string;
    date: string;
    overloadMinutes: number;
    warningTypes: readonly string[];
    warningHighCount: number;
    isFeasible: boolean;
  };
  replan_triggered: {
    tripId: string;
    actionCount: number;
    reason: string;
    actionTypes: Record<string, number>;
    uniqueDayIds: number;
  };
  item_skipped: {
    tripId: string;
    dayId: string;
    blockId: string;
    previousStatus: string;
    blockCategory: string;
    offlineQueued: boolean;
  };
  item_completed: {
    tripId: string;
    dayId: string;
    blockId: string;
    previousStatus: string;
    blockCategory: string;
    offlineQueued: boolean;
  };
  event_match_low_confidence: {
    mode: string;
    resultCount: number;
    topConfidence: number;
    secondConfidence?: number;
  };
  image_resolution_failed: {
    stage: string;
    categoryBucket: string;
    hadDirectUrl: boolean;
    hadCoordinateFields: boolean;
  };
  opening_hours_unknown: {
    tripId: string;
    dayId: string;
    date: string;
    unknownBlockCount: number;
  };
  budget_suspicious: {
    dayId: string;
    suspiciousCount: number;
    blockCount: number;
    currency: string;
  };
  offline_sync_failed: {
    failed: number;
    applied: number;
    failedByMutationType: Record<string, number>;
    remainingQueueDepth: number;
    affectedTripCount: number;
  };
};
