import type { ActivityBlock } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { ActivityOverlayEntry } from "./planOverlayModel";
import { formatDateInTimeZone, planLocalDateTime } from "../pacing/planTimeUtils";
import { hasRealLocation, isEffectivelySkipped, isEffectivelyVisited } from "./planVisitOverlayHelpers";

export type VisitTimingRole = "active" | "next" | "recent";

export interface VisitSuggestion {
  role: VisitTimingRole;
  activityKey: string;
  block: ActivityBlock;
  message: string;
  priority: number;
}

const placeName = (block: ActivityBlock): string => block.place?.name?.trim() || block.title.trim();

export const matchVisitTimingRole = (
  day: DayPlan,
  block: ActivityBlock,
  now: Date,
  timeZone: string,
): VisitTimingRole | null => {
  if (day.date !== formatDateInTimeZone(now, timeZone)) {
    return null;
  }

  if (!hasRealLocation(block)) {
    return null;
  }

  const nowMs = now.getTime();
  const activeStart = planLocalDateTime(day.date, block.startTime, timeZone).subtract(15, "minute").valueOf();
  const activeEnd = planLocalDateTime(day.date, block.endTime, timeZone).add(30, "minute").valueOf();
  if (nowMs >= activeStart && nowMs <= activeEnd) {
    return "active";
  }

  const blockStartMs = planLocalDateTime(day.date, block.startTime, timeZone).valueOf();
  if (blockStartMs > nowMs && blockStartMs <= nowMs + 60 * 60 * 1000) {
    return "next";
  }

  const blockEndMs = planLocalDateTime(day.date, block.endTime, timeZone).valueOf();
  if (blockEndMs <= nowMs && blockEndMs >= nowMs - 90 * 60 * 1000) {
    return "recent";
  }

  return null;
};

export const buildVisitSuggestionMessage = (role: VisitTimingRole, block: ActivityBlock): string => {
  const place = placeName(block);
  if (role === "active") {
    return `Looks like you might be at ${place}. Mark as visited?`;
  }
  if (role === "next") {
    return `Next up: ${place}. Mark as visited when you arrive?`;
  }
  return `Did you visit ${place}?`;
};

export const getVisitSuggestion = (
  day: DayPlan,
  orderedBlocks: ActivityBlock[],
  overlayByKey: Record<string, ActivityOverlayEntry | undefined>,
  activityKey: (dayIndex: number, blockIndex: number, block: ActivityBlock) => string,
  dayIndex: number,
  now: Date,
  timeZone: string,
): VisitSuggestion | null => {
  const tuples: Array<{ suggestion: VisitSuggestion; startMs: number }> = [];

  orderedBlocks.forEach((block, blockIndex) => {
    const key = activityKey(dayIndex, blockIndex, block);
    const overlay = overlayByKey[key];
    if (isEffectivelyVisited(block, overlay) || isEffectivelySkipped(block, overlay)) {
      return;
    }
    if (!hasRealLocation(block)) {
      return;
    }

    const role = matchVisitTimingRole(day, block, now, timeZone);
    if (!role) {
      return;
    }

    const priority = role === "active" ? 1 : role === "recent" ? 2 : 3;
    const startMs = planLocalDateTime(day.date, block.startTime, timeZone).valueOf();
    tuples.push({
      startMs,
      suggestion: {
        role,
        activityKey: key,
        block,
        message: buildVisitSuggestionMessage(role, block),
        priority,
      },
    });
  });

  if (tuples.length === 0) {
    return null;
  }

  tuples.sort((left, right) => {
    if (left.suggestion.priority !== right.suggestion.priority) {
      return left.suggestion.priority - right.suggestion.priority;
    }
    return left.startMs - right.startMs;
  });

  return tuples[0]?.suggestion ?? null;
};
