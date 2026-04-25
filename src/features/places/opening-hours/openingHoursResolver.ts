import type { OpeningHours } from "./openingHours.types";

export interface ParsedRange {
  startMinutes: number;
  endMinutes: number;
  wrapsMidnight: boolean;
}

export type ParsedSchedule = Record<number, ParsedRange[]>;

const unknownOpeningHoursLabels = ["opening hours are not published yet", "hours unavailable", "unknown"];
const weekdayTokens = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const normalizeText = (value: string): string => value.trim().toLowerCase();

export const isUnknownOpeningHoursLabel = (value: string | undefined): boolean =>
  !value || unknownOpeningHoursLabels.some((item) => normalizeText(value).includes(item));

const parseTimeToMinutes = (value: string): number | null => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 24 || minutes > 59) {
    return null;
  }
  if (hours === 24 && minutes !== 0) {
    return null;
  }
  if (hours === 24 && minutes === 0) {
    return 24 * 60;
  }

  return hours * 60 + minutes;
};

const parseDayToken = (token: string): number | null => {
  const normalized = token.trim().slice(0, 2);
  const index = weekdayTokens.findIndex((item) => item === normalized);
  return index >= 0 ? index : null;
};

const parseDaySpec = (value: string): number[] => {
  if (value.trim().length === 0) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  return value
    .split(",")
    .flatMap((part) => {
      const normalized = part.trim();
      if (normalized.includes("-")) {
        const [startToken, endToken] = normalized.split("-");
        const start = parseDayToken(startToken ?? "");
        const end = parseDayToken(endToken ?? "");
        if (start === null || end === null) {
          return [];
        }

        const result: number[] = [];
        let cursor = start;
        result.push(cursor);
        while (cursor !== end) {
          cursor = (cursor + 1) % 7;
          result.push(cursor);
        }
        return result;
      }

      const single = parseDayToken(normalized);
      return single === null ? [] : [single];
    })
    .filter((v, index, values) => values.indexOf(v) === index);
};

const parseTimeRanges = (value: string): ParsedRange[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const [startText, endText] = part.split("-");
      const startMinutes = parseTimeToMinutes(startText ?? "");
      const endMinutes = parseTimeToMinutes(endText ?? "");
      if (startMinutes === null || endMinutes === null) {
        return null;
      }

      return {
        startMinutes,
        endMinutes,
        wrapsMidnight: endMinutes <= startMinutes,
      };
    })
    .filter((range): range is ParsedRange => Boolean(range));

const parseSchedule = (openingHoursLabel: string): ParsedSchedule | null => {
  const normalized = openingHoursLabel.trim();
  if (normalized === "24/7") {
    return {
      0: [{ startMinutes: 0, endMinutes: 24 * 60, wrapsMidnight: false }],
      1: [{ startMinutes: 0, endMinutes: 24 * 60, wrapsMidnight: false }],
      2: [{ startMinutes: 0, endMinutes: 24 * 60, wrapsMidnight: false }],
      3: [{ startMinutes: 0, endMinutes: 24 * 60, wrapsMidnight: false }],
      4: [{ startMinutes: 0, endMinutes: 24 * 60, wrapsMidnight: false }],
      5: [{ startMinutes: 0, endMinutes: 24 * 60, wrapsMidnight: false }],
      6: [{ startMinutes: 0, endMinutes: 24 * 60, wrapsMidnight: false }],
    };
  }

  const rules = normalized.split(";").map((part) => part.trim()).filter(Boolean);
  if (rules.length === 0) {
    return null;
  }

  const schedule: ParsedSchedule = {};
  for (const rule of rules) {
    const offMatch = rule.match(/^([A-Za-z,\- ]+)\s+off$/i);
    if (offMatch) {
      const days = parseDaySpec(offMatch[1] ?? "");
      days.forEach((day) => {
        schedule[day] = [];
      });
      continue;
    }

    const explicitMatch = rule.match(/^([A-Za-z,\- ]+)\s+(.+)$/);
    const dayPart = explicitMatch?.[1] ?? "";
    const timePart = explicitMatch?.[2] ?? rule;
    const days = explicitMatch ? parseDaySpec(dayPart) : [0, 1, 2, 3, 4, 5, 6];
    const ranges = parseTimeRanges(timePart);
    if (ranges.length === 0) {
      continue;
    }

    days.forEach((day) => {
      schedule[day] = [...(schedule[day] ?? []), ...ranges];
    });
  }

  return Object.keys(schedule).length > 0 ? schedule : null;
};

const fmtHHmm = (totalMinutes: number): string => {
  if (totalMinutes <= 0) {
    return "00:00";
  }
  if (totalMinutes >= 24 * 60) {
    return "24:00";
  }
  const h = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const scheduleToOpeningHoursPeriods = (schedule: ParsedSchedule): OpeningHours["periods"] => {
  const periods: OpeningHours["periods"] = [];
  for (const dayStr of Object.keys(schedule)) {
    const day = Number(dayStr);
    const ranges = schedule[day] ?? [];
    for (const range of ranges) {
      periods.push({
        day,
        open: fmtHHmm(range.startMinutes),
        close: fmtHHmm(range.endMinutes),
      });
    }
  }
  return periods;
};

/**
 * Deterministic parse of provider `openingHoursLabel` strings (e.g. OSM / Google-style compact rules).
 * Does not invent hours — returns `null` when the label is missing or unparsable.
 */
export const resolveOpeningHoursFromLabel = (openingHoursLabel: string | undefined, timezone: string): OpeningHours | null => {
  if (isUnknownOpeningHoursLabel(openingHoursLabel)) {
    return null;
  }

  const schedule = parseSchedule(openingHoursLabel ?? "");
  if (!schedule) {
    return null;
  }

  const periods = scheduleToOpeningHoursPeriods(schedule);
  if (periods.length === 0) {
    return null;
  }

  return {
    timezone: timezone.trim() || "UTC",
    sourceLabel: (openingHoursLabel ?? "").trim(),
    periods,
  };
};

/** Same grammar as {@link resolveOpeningHoursFromLabel}, for validators that already hold a `sourceLabel`. */
export const parseOpeningHoursLabelToSchedule = (label: string): ParsedSchedule | null => parseSchedule(label);
