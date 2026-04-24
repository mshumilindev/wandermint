import dayjs from "dayjs";
import type { ActivityBlock, PlaceSnapshot } from "../../entities/activity/model";
import { normalizeItineraryCategory } from "./itineraryCompositionService";

type OpeningHoursFit = "open" | "closed" | "unknown";

interface ParsedRange {
  startMinutes: number;
  endMinutes: number;
  wrapsMidnight: boolean;
}

type ParsedSchedule = Record<number, ParsedRange[]>;

const unknownOpeningHoursLabels = ["opening hours are not published yet", "hours unavailable", "unknown"];
const weekdayTokens = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const normalizeText = (value: string): string => value.trim().toLowerCase();

const isUnknownLabel = (value: string | undefined): boolean =>
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
    .filter((value, index, values) => values.indexOf(value) === index);
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

const checkOpeningHours = (
  openingHoursLabel: string | undefined,
  date: string,
  startTime: string,
  endTime: string,
): OpeningHoursFit => {
  if (isUnknownLabel(openingHoursLabel)) {
    return "unknown";
  }

  const schedule = parseSchedule(openingHoursLabel ?? "");
  if (!schedule) {
    return "unknown";
  }

  const startDateTime = dayjs(`${date}T${startTime}`);
  const endDateTime = dayjs(`${date}T${endTime}`);
  if (!startDateTime.isValid() || !endDateTime.isValid()) {
    return "unknown";
  }

  const midpoint = startDateTime.add(Math.max(endDateTime.diff(startDateTime, "minute"), 0) / 2, "minute");
  const checkpoints = [startDateTime, midpoint, endDateTime.subtract(1, "minute")];

  return checkpoints.every((checkpoint) => isOpenAtMinute(schedule, checkpoint.day(), checkpoint.hour() * 60 + checkpoint.minute()))
    ? "open"
    : "closed";
};

const isSamePlace = (left: PlaceSnapshot, right: PlaceSnapshot): boolean =>
  (left.providerPlaceId && right.providerPlaceId && left.provider === right.provider && left.providerPlaceId === right.providerPlaceId) ||
  normalizeText(left.name) === normalizeText(right.name);

const replacePlaceText = (value: string, fromName: string, toName: string): string =>
  value.includes(fromName) ? value.replaceAll(fromName, toName) : value;

const chooseOpenReplacement = (
  block: ActivityBlock,
  date: string,
  candidatePlaces: PlaceSnapshot[],
): PlaceSnapshot | null => {
  const desiredCategory = normalizeItineraryCategory(block);
  const available = candidatePlaces
    .filter((place) => !block.place || !isSamePlace(place, block.place))
    .filter((place, index, values) => values.findIndex((item) => isSamePlace(item, place)) === index)
    .filter((place) => checkOpeningHours(place.openingHoursLabel, date, block.startTime, block.endTime) === "open");

  const categoryWeighted = available.sort((left, right) => {
    const leftScore = normalizeText(left.name).includes(desiredCategory) ? 1 : 0;
    const rightScore = normalizeText(right.name).includes(desiredCategory) ? 1 : 0;
    return rightScore - leftScore;
  });

  return categoryWeighted[0] ?? null;
};

export const openingHoursService = {
  getOpeningHoursFit: checkOpeningHours,
  chooseOpenCandidate: (places: PlaceSnapshot[], date: string, startTime: string, endTime: string): PlaceSnapshot | null => {
    const openPlaces = places.filter((place) => checkOpeningHours(place.openingHoursLabel, date, startTime, endTime) === "open");
    if (openPlaces.length > 0) {
      return openPlaces[0] ?? null;
    }

    const unknownPlaces = places.filter((place) => checkOpeningHours(place.openingHoursLabel, date, startTime, endTime) === "unknown");
    return unknownPlaces[0] ?? null;
  },
  enrichBlockWithOpenReplacement: (block: ActivityBlock, date: string, additionalPlaces: PlaceSnapshot[] = []): ActivityBlock => {
    if (!block.place) {
      return block;
    }

    const fit = checkOpeningHours(block.place.openingHoursLabel, date, block.startTime, block.endTime);
    if (fit !== "closed") {
      return block;
    }

    const replacement = chooseOpenReplacement(
      block,
      date,
      [
        ...block.alternatives.map((alternative) => alternative.place).filter((place): place is PlaceSnapshot => Boolean(place)),
        ...block.sourceSnapshots,
        ...additionalPlaces,
      ],
    );

    if (!replacement) {
      return block;
    }

    return {
      ...block,
      title: block.place ? replacePlaceText(block.title, block.place.name, replacement.name) : block.title,
      description: block.place ? replacePlaceText(block.description, block.place.name, replacement.name) : block.description,
      place: replacement,
      sourceSnapshots: [replacement, ...block.sourceSnapshots.filter((place) => !isSamePlace(place, replacement))],
    };
  },
};
