import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import type {
  NotificationCategory,
  NotificationScheduleInput,
  NotificationSeverity,
  TripNotification,
} from "./notification.types";
import { DEFAULT_NOTIFICATION_COOLDOWNS_MS, DEFAULT_NOTIFICATION_PREFERENCES } from "./notification.types";

dayjs.extend(utc);
dayjs.extend(timezone);

const severityOrder: Record<NotificationSeverity, number> = { high: 0, medium: 1, low: 2 };

const isDone = (item: TripPlanItem, completed: readonly string[], skipped: readonly string[]): boolean =>
  completed.includes(item.id) || skipped.includes(item.id) || item.status === "completed" || item.status === "skipped";

const minutesUntil = (nowMs: number, iso: string): number | null => {
  const end = dayjs(iso).valueOf();
  if (!Number.isFinite(end)) {
    return null;
  }
  return (end - nowMs) / 60_000;
};

const minutesSince = (nowMs: number, iso: string): number | null => {
  const start = dayjs(iso).valueOf();
  if (!Number.isFinite(start)) {
    return null;
  }
  return (nowMs - start) / 60_000;
};

const passesThrottle = (
  category: NotificationCategory,
  dedupeKey: string,
  evaluationTimeMs: number,
  lastEmittedAtByDedupeKey: Readonly<Record<string, number>>,
  cooldownMsByCategory: Partial<Record<NotificationCategory, number>> | undefined,
): boolean => {
  const cooldown = cooldownMsByCategory?.[category] ?? DEFAULT_NOTIFICATION_COOLDOWNS_MS[category];
  const last = lastEmittedAtByDedupeKey[dedupeKey];
  if (last === undefined) {
    return true;
  }
  return evaluationTimeMs - last >= cooldown;
};

const notif = (
  tripId: string,
  category: NotificationCategory,
  severity: NotificationSeverity,
  title: string,
  body: string,
  dedupeKey: string,
  evaluationTimeMs: number,
  relatedItemId?: string,
): TripNotification => ({
  id: `${tripId}:${dedupeKey}`,
  tripId,
  category,
  severity,
  title,
  body,
  dedupeKey,
  relatedItemId,
  createdAt: new Date(evaluationTimeMs).toISOString(),
});

/**
 * Derives itinerary-grounded alerts for live mode and background use (Rule 1).
 * Respects category toggles and throttle map (Rules 2–3). Caller updates
 * `lastEmittedAtByDedupeKey` when an alert is actually shown or pushed.
 */
export const computeTripNotifications = (input: NotificationScheduleInput): TripNotification[] => {
  const tripId = input.tripId.trim();
  if (!tripId) {
    return [];
  }

  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...input.preferences };
  const enabled = (c: NotificationCategory): boolean => prefs[c] !== false;

  const { evaluationTimeMs, lastEmittedAtByDedupeKey, cooldownMsByCategory } = input.throttle;
  const nowIso = input.execution.now;
  const nowMs = dayjs(nowIso).valueOf();
  if (!Number.isFinite(nowMs)) {
    return [];
  }

  const items = [...input.execution.items].sort((a, b) => a.plannedStartTime.localeCompare(b.plannedStartTime));
  const completed = input.execution.completedItemIds ?? [];
  const skipped = input.execution.skippedItemIds ?? [];

  const out: TripNotification[] = [];
  const push = (n: TripNotification, category: NotificationCategory): void => {
    if (!enabled(category)) {
      return;
    }
    if (!passesThrottle(category, n.dedupeKey, evaluationTimeMs, lastEmittedAtByDedupeKey, cooldownMsByCategory)) {
      return;
    }
    out.push(n);
  };

  if (input.offlineSyncFailed && enabled("offline_sync_failed")) {
    push(
      notif(
        tripId,
        "offline_sync_failed",
        "high",
        "Offline sync failed",
        "Some changes could not be uploaded. They stay queued and will retry when you are back online.",
        "offline_sync_failed",
        evaluationTimeMs,
      ),
      "offline_sync_failed",
    );
  }

  if (input.planTimelineOverloaded && enabled("plan_overloaded")) {
    push(
      notif(
        tripId,
        "plan_overloaded",
        "high",
        "Plan looks overloaded",
        "This day may not fit realistic travel and buffers. Consider trimming or replanning.",
        "plan_overloaded",
        evaluationTimeMs,
      ),
      "plan_overloaded",
    );
  }

  const risk = input.execution.weatherRisk;
  if ((risk === "high" || risk === "medium") && enabled("weather_risk")) {
    push(
      notif(
        tripId,
        "weather_risk",
        risk === "high" ? "high" : "medium",
        "Weather risk",
        risk === "high"
          ? "Severe weather may affect outdoor parts of today’s plan."
          : "Weather might affect outdoor stops—check conditions before heading out.",
        `weather_risk:${risk}`,
        evaluationTimeMs,
      ),
      "weather_risk",
    );
  }

  const upcoming = items.filter((it) => !isDone(it, completed, skipped));
  const next = upcoming[0];
  if (next) {
    const untilStart = minutesUntil(nowMs, next.plannedStartTime);
    const travel = Math.max(0, next.travelTimeFromPreviousMinutes ?? 0);
    const leaveLeadMinutes = travel + 8;

    if (untilStart !== null && untilStart > 0 && untilStart <= leaveLeadMinutes + 5 && enabled("leave_now")) {
      push(
        notif(
          tripId,
          "leave_now",
          untilStart <= travel ? "high" : "medium",
          "Time to go",
          travel > 0
            ? `Head out for “${next.title}” — about ${Math.round(travel)} min travel plus buffer before start.`
            : `“${next.title}” starts soon.`,
          `leave_now:${next.id}`,
          evaluationTimeMs,
          next.id,
        ),
        "leave_now",
      );
    } else if (
      untilStart !== null &&
      untilStart > 0 &&
      untilStart <= 25 &&
      untilStart > leaveLeadMinutes + 5 &&
      enabled("next_item_starts_soon")
    ) {
      push(
        notif(
          tripId,
          "next_item_starts_soon",
          "low",
          "Next stop soon",
          `“${next.title}” starts in about ${Math.round(untilStart)} min.`,
          `next_soon:${next.id}`,
          evaluationTimeMs,
          next.id,
        ),
        "next_item_starts_soon",
      );
    }

    const block = input.activityBlockByItemId?.[next.id];
    if (block?.dependencies.bookingRequired && untilStart !== null && untilStart < 48 * 60 && enabled("booking_required")) {
      push(
        notif(
          tripId,
          "booking_required",
          "medium",
          "Booking may be required",
          `“${next.title}” is marked as needing a booking — confirm before you arrive.`,
          `booking:${next.id}`,
          evaluationTimeMs,
          next.id,
        ),
        "booking_required",
      );
    }
  }

  const current = items.find((it) => {
    if (isDone(it, completed, skipped)) {
      return false;
    }
    const sinceStart = minutesSince(nowMs, it.plannedStartTime);
    const untilEnd = minutesUntil(nowMs, it.plannedEndTime);
    if (sinceStart === null || untilEnd === null) {
      return false;
    }
    return sinceStart >= 0 && untilEnd >= 0;
  });

  if (current?.openingHoursLabel && enabled("place_closing_soon")) {
    const untilEnd = minutesUntil(nowMs, current.plannedEndTime);
    if (untilEnd !== null && untilEnd <= 90 && untilEnd >= 0) {
      push(
        notif(
          tripId,
          "place_closing_soon",
          "medium",
          "Check closing time",
          `You’re scheduled at “${current.title}” with listed hours — confirm the venue is still open before the end of this stop.`,
          `closing:${current.id}`,
          evaluationTimeMs,
          current.id,
        ),
        "place_closing_soon",
      );
    }
  }

  return out.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.title.localeCompare(b.title));
};

/**
 * Call after surfacing {@link TripNotification}s so the same `dedupeKey` respects cooldown (Rule 2).
 */
export const recordNotificationEmissions = (
  lastEmittedAtByDedupeKey: Record<string, number>,
  notifications: readonly TripNotification[],
  evaluationTimeMs: number,
): Record<string, number> => {
  const next = { ...lastEmittedAtByDedupeKey };
  for (const n of notifications) {
    next[n.dedupeKey] = evaluationTimeMs;
  }
  return next;
};
