import type { ActivityBlock } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { ActivityOverlayEntry } from "../visited/planOverlayModel";
import { isEffectivelySkipped, isEffectivelyVisited } from "../visited/planVisitOverlayHelpers";
import { formatDateInTimeZone, planLocalDateTime, timeToMinutes } from "./planTimeUtils";

export type PlanPacingState = "on_track" | "ahead" | "behind";

export interface PlanPacingInput {
  day: DayPlan;
  dayIndex: number;
  orderedBlocks: ActivityBlock[];
  overlayByKey: Record<string, ActivityOverlayEntry | undefined>;
  activityKey: (dayIndex: number, blockIndex: number, block: ActivityBlock) => string;
  now: Date;
  timeZone: string;
}

const blockEnd = (dayDate: string, block: ActivityBlock, timeZone: string) => planLocalDateTime(dayDate, block.endTime, timeZone);

const blockStart = (dayDate: string, block: ActivityBlock, timeZone: string) => planLocalDateTime(dayDate, block.startTime, timeZone);

export const computePlanPacingState = (input: PlanPacingInput): PlanPacingState => {
  const { day, orderedBlocks, overlayByKey, activityKey, now, timeZone } = input;
  const nowMs = now.getTime();
  const calendarDay = formatDateInTimeZone(now, timeZone);
  const isPlanDayToday = day.date === calendarDay;

  let expectedCompleted = 0;
  if (day.date < calendarDay) {
    expectedCompleted = orderedBlocks.length;
  } else if (day.date > calendarDay) {
    expectedCompleted = 0;
  } else {
    orderedBlocks.forEach((block) => {
      const end = blockEnd(day.date, block, timeZone);
      if (end.valueOf() <= nowMs) {
        expectedCompleted += 1;
      }
    });
  }

  let actualCompleted = 0;
  orderedBlocks.forEach((block, blockIndex) => {
    const key = activityKey(input.dayIndex, blockIndex, block);
    if (isEffectivelyVisited(block, overlayByKey[key])) {
      actualCompleted += 1;
    }
  });

  const delta = actualCompleted - expectedCompleted;

  let state: PlanPacingState = "on_track";
  if (delta >= 1) {
    state = "ahead";
  } else if (delta <= -1) {
    state = "behind";
  }

  if (isPlanDayToday) {
    const firstOpenIndex = orderedBlocks.findIndex((block, blockIndex) => {
      const key = activityKey(input.dayIndex, blockIndex, block);
      const overlay = overlayByKey[key];
      return !isEffectivelyVisited(block, overlay) && !isEffectivelySkipped(block, overlay);
    });
    if (firstOpenIndex >= 0) {
      const block = orderedBlocks[firstOpenIndex] as ActivityBlock;
      const late = blockEnd(day.date, block, timeZone).add(30, "minute").valueOf() < nowMs;
      if (late) {
        state = "behind";
      }
    }
  }

  const nextTwoVisited =
    orderedBlocks.length >= 2 &&
    [0, 1].every((offset) => {
      const block = orderedBlocks[offset];
      if (!block) {
        return false;
      }
      const key = activityKey(input.dayIndex, offset, block);
      return isEffectivelyVisited(block, overlayByKey[key]);
    });

  if (nextTwoVisited) {
    state = "ahead";
  }

  return state;
};

export interface FastCompletionSignal {
  tooFast: boolean;
  avgActualVsPlannedRatio: number | null;
}

/** Heuristic: recent visited blocks completed much faster than scheduled duration. */
export const detectFastCompletionPattern = (
  day: DayPlan,
  orderedBlocks: ActivityBlock[],
  overlayByKey: Record<string, ActivityOverlayEntry | undefined>,
  activityKey: (dayIndex: number, blockIndex: number, block: ActivityBlock) => string,
  dayIndex: number,
  now: Date,
  timeZone: string,
): FastCompletionSignal => {
  const nowMs = now.getTime();
  const windowStart = nowMs - 90 * 60 * 1000;
  const ratios: number[] = [];

  orderedBlocks.forEach((block, blockIndex) => {
    const key = activityKey(dayIndex, blockIndex, block);
    const overlay = overlayByKey[key];
    if (!overlay?.visitedAt) {
      return;
    }
    const visitedAt = new Date(overlay.visitedAt).getTime();
    if (visitedAt < windowStart || visitedAt > nowMs) {
      return;
    }
    const planned = Math.max(15, timeToMinutes(block.endTime) - timeToMinutes(block.startTime));
    const start = blockStart(day.date, block, timeZone);
    const actualMinutes = Math.max(5, (visitedAt - start.valueOf()) / 60000);
    ratios.push(actualMinutes / planned);
  });

  if (ratios.length === 0) {
    return { tooFast: false, avgActualVsPlannedRatio: null };
  }

  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const tooFast = ratios.length >= 2 && avg < 0.45;
  return { tooFast, avgActualVsPlannedRatio: avg };
};
