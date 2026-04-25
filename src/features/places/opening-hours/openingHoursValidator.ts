import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import type { OpeningHours, OpeningHoursValidationResult, PlanSlotOpeningHoursCheck } from "./openingHours.types";
import type { ParsedSchedule } from "./openingHoursResolver";
import { parseOpeningHoursLabelToSchedule } from "./openingHoursResolver";

dayjs.extend(utc);
dayjs.extend(timezone);

const isOpenAtMinute = (schedule: ParsedSchedule, weekday: number, minuteOfDay: number): boolean => {
  const sameDayRanges = schedule[weekday] ?? [];
  const previousDayRanges = schedule[(weekday + 6) % 7] ?? [];

  const openOnSameDay = sameDayRanges.some((range) =>
    range.wrapsMidnight ? minuteOfDay >= range.startMinutes : minuteOfDay >= range.startMinutes && minuteOfDay < range.endMinutes,
  );
  if (openOnSameDay) {
    return true;
  }

  return previousDayRanges.some((range) => range.wrapsMidnight && minuteOfDay < range.endMinutes);
};

const closureDateSet = (hours: OpeningHours): Set<string> => new Set((hours.specialClosures ?? []).map((c) => c.date.trim()).filter(Boolean));

const checkpointOnSpecialClosure = (hours: OpeningHours, localDate: string, closures: Set<string>): { closed: boolean; reason?: string } => {
  if (!closures.has(localDate)) {
    return { closed: false };
  }
  const match = hours.specialClosures?.find((c) => c.date.trim() === localDate);
  return {
    closed: true,
    reason: match?.reason ? `Closed (${match.reason})` : "Closed (special date)",
  };
};

const buildCheckpoints = (start: dayjs.Dayjs, end: dayjs.Dayjs): dayjs.Dayjs[] => {
  const diffMin = Math.max(end.diff(start, "minute"), 0);
  const midpoint = start.add(diffMin / 2, "minute");
  const almostEnd = end.subtract(1, "minute");
  const checkpoints = [start, midpoint, almostEnd];
  return checkpoints.filter((c) => c.isValid());
};

const findNextOpenIso = (
  schedule: ParsedSchedule,
  afterExclusive: dayjs.Dayjs,
  tz: string,
  closures: Set<string>,
  maxMinutesToScan = 14 * 24 * 60,
): string | undefined => {
  let probe = afterExclusive.add(1, "minute");
  const limit = afterExclusive.add(maxMinutesToScan, "minute");

  while (probe.isBefore(limit) || probe.isSame(limit)) {
    const dateStr = probe.format("YYYY-MM-DD");
    if (!closures.has(dateStr)) {
      const weekday = probe.day();
      const minuteOfDay = probe.hour() * 60 + probe.minute();
      if (isOpenAtMinute(schedule, weekday, minuteOfDay)) {
        return probe.utc().toISOString();
      }
    }
    probe = probe.add(1, "minute");
  }
  return undefined;
};

/**
 * Validates a resolved {@link OpeningHours} model against absolute planned instants.
 * Missing or unparsable hours → `unknown` (never `open`).
 */
export const validatePlanWindowAgainstOpeningHours = (
  openingHours: OpeningHours | null | undefined,
  plannedStartTime: string,
  plannedEndTime: string,
): OpeningHoursValidationResult => {
  if (!openingHours) {
    return { status: "unknown", reason: "Opening hours are not available." };
  }

  const schedule = parseOpeningHoursLabelToSchedule(openingHours.sourceLabel);
  if (!schedule) {
    return { status: "unknown", reason: "Opening hours could not be interpreted." };
  }

  const tz = openingHours.timezone?.trim() || "UTC";
  const start = dayjs(plannedStartTime).tz(tz);
  const end = dayjs(plannedEndTime).tz(tz);
  if (!start.isValid() || !end.isValid()) {
    return { status: "unknown", reason: "Planned window is not a valid time range." };
  }

  if (!end.isAfter(start)) {
    return { status: "unknown", reason: "Planned end is not after planned start." };
  }

  const closures = closureDateSet(openingHours);
  const checkpoints = buildCheckpoints(start, end);

  for (const checkpoint of checkpoints) {
    const localDate = checkpoint.format("YYYY-MM-DD");
    const closureHit = checkpointOnSpecialClosure(openingHours, localDate, closures);
    if (closureHit.closed) {
      const nextOpenTime = findNextOpenIso(schedule, end, tz, closures);
      return {
        status: "closed",
        reason: closureHit.reason,
        nextOpenTime,
      };
    }

    const weekday = checkpoint.day();
    const minuteOfDay = checkpoint.hour() * 60 + checkpoint.minute();
    if (!isOpenAtMinute(schedule, weekday, minuteOfDay)) {
      const nextOpenTime = findNextOpenIso(schedule, end, tz, closures);
      return {
        status: "closed",
        reason: "Outside published opening hours for this window.",
        nextOpenTime,
      };
    }
  }

  return { status: "open" };
};

export const toPlanSlotOpeningHoursCheck = (result: OpeningHoursValidationResult): PlanSlotOpeningHoursCheck => ({
  result,
  slotInvalid: result.status === "closed",
});
