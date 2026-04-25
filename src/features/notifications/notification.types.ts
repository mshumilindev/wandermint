import type { ActivityBlock } from "../../entities/activity/model";
import type { TripExecutionState } from "../trip-execution/decisionEngine.types";

/** One logical alert channel; user preferences may disable each (Rule 3). */
export type NotificationCategory =
  | "leave_now"
  | "booking_required"
  | "place_closing_soon"
  | "next_item_starts_soon"
  | "plan_overloaded"
  | "weather_risk"
  | "offline_sync_failed";

export type NotificationSeverity = "low" | "medium" | "high";

/**
 * In-app / live-mode alert payload (Rule 4 — same structure wherever the UI renders alerts).
 */
export type TripNotification = {
  /** Stable within a tick; use {@link TripNotification.dedupeKey} for list keys. */
  id: string;
  tripId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** Used with {@link NotificationThrottleState} to avoid spam (Rule 2). */
  dedupeKey: string;
  relatedItemId?: string;
  createdAt: string;
};

export type NotificationPreferences = Partial<Record<NotificationCategory, boolean>>;

export type NotificationThrottleState = {
  /** Monotonic clock for tests / deterministic replays. */
  evaluationTimeMs: number;
  /**
   * Minimum gap before the same `dedupeKey` may appear again.
   * Omit categories to use {@link DEFAULT_NOTIFICATION_COOLDOWNS_MS}.
   */
  cooldownMsByCategory?: Partial<Record<NotificationCategory, number>>;
  /** Prior emissions from client store: dedupeKey → last evaluationTimeMs when shown. */
  lastEmittedAtByDedupeKey: Readonly<Record<string, number>>;
};

export type NotificationScheduleInput = {
  tripId: string;
  /** IANA zone for interpreting wall times on items. */
  timeZone: string;
  execution: Pick<
    TripExecutionState,
    "items" | "completedItemIds" | "skippedItemIds" | "weatherRisk" | "userLocation" | "now"
  >;
  /** Same-day blocks keyed by itinerary id (booking / opening-hour sensitivity). */
  activityBlockByItemId?: Readonly<Record<string, ActivityBlock>>;
  /** From timeline validation (`!isFeasible`) for the active day. */
  planTimelineOverloaded?: boolean;
  /** Caller-reported sync failure (e.g. offline queue flush error). */
  offlineSyncFailed?: boolean;
  preferences?: NotificationPreferences;
  throttle: NotificationThrottleState;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: Required<Record<NotificationCategory, boolean>> = {
  leave_now: true,
  booking_required: true,
  place_closing_soon: true,
  next_item_starts_soon: true,
  plan_overloaded: true,
  weather_risk: true,
  offline_sync_failed: true,
};

export const DEFAULT_NOTIFICATION_COOLDOWNS_MS: Record<NotificationCategory, number> = {
  leave_now: 120_000,
  booking_required: 6 * 60 * 60_000,
  place_closing_soon: 20 * 60_000,
  next_item_starts_soon: 5 * 60_000,
  plan_overloaded: 30 * 60_000,
  weather_risk: 45 * 60_000,
  offline_sync_failed: 10 * 60_000,
};

export const isCategoryEnabled = (
  category: NotificationCategory,
  preferences: NotificationPreferences | undefined,
): boolean => {
  const v = preferences?.[category];
  return v !== false;
};
