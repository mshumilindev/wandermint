import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(isBetween);

import {
  CITY_TO_TIMING_COUNTRY,
  COUNTRY_NAME_TO_TIMING_KEY,
  STATIC_TIMING_RULES,
  type StaticTimingRule,
  timingRuleToInsight,
} from "./travelTimingData";
import { refineTravelTimingInsights } from "./travelTimingAiLayer";
import type {
  AnalyzeTravelTimingInput,
  BetterDateWindow,
  SuggestBetterDatesInput,
  TravelTimingDateRange,
  TravelTimingInsight,
} from "./travelTimingTypes";

const pad2 = (n: number): string => String(n).padStart(2, "0");

const endOfMonthDay = (year: number, month: number): number => dayjs(`${year}-${pad2(month)}-01`).daysInMonth();

/**
 * True if `d` falls inside the rule’s calendar window for that year (handles Nov→Feb wrap).
 */
export const calendarDayMatchesRuleWindow = (d: dayjs.Dayjs, w: StaticTimingRule["window"]): boolean => {
  const y = d.year();
  const m = d.month() + 1;
  const day = d.date();

  const hasFineBounds = w.startDay != null || w.endDay != null;

  if (hasFineBounds) {
    const sm = w.startMonth;
    const sd = w.startDay ?? 1;
    const em = w.endMonth;
    const ed = w.endDay ?? endOfMonthDay(y, em);
    const start = dayjs(`${y}-${pad2(sm)}-${pad2(sd)}`);
    let end = dayjs(`${y}-${pad2(em)}-${pad2(ed)}`);
    if (end.isBefore(start, "day")) {
      end = end.add(1, "year");
    }
    return d.isBetween(start, end, "day", "[]");
  }

  if (w.startMonth <= w.endMonth) {
    return m >= w.startMonth && m <= w.endMonth;
  }

  return m >= w.startMonth || m <= w.endMonth;
};

const eachTripDay = (range: TravelTimingDateRange, maxDays = 400): dayjs.Dayjs[] => {
  const start = dayjs(range.start);
  const end = dayjs(range.end);
  if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) {
    return [];
  }
  const out: dayjs.Dayjs[] = [];
  for (let d = start.startOf("day"); !d.isAfter(end, "day") && out.length < maxDays; d = d.add(1, "day")) {
    out.push(d);
  }
  return out;
};

const tripTouchesRule = (range: TravelTimingDateRange, rule: StaticTimingRule): boolean => {
  return eachTripDay(range).some((d) => calendarDayMatchesRuleWindow(d, rule.window));
};

export const resolveTimingCountryKey = (input: {
  country: string;
  city?: string;
  destinationLabel?: string;
}): string | null => {
  const rawCountry = input.country.trim().toLowerCase();
  if (rawCountry) {
    const direct = COUNTRY_NAME_TO_TIMING_KEY[rawCountry];
    if (direct) {
      return direct;
    }
    const stripped = rawCountry.replace(/\./g, "");
    const alias = COUNTRY_NAME_TO_TIMING_KEY[stripped];
    if (alias) {
      return alias;
    }
  }

  const city = (input.city ?? "").trim().toLowerCase();
  if (city && CITY_TO_TIMING_COUNTRY[city]) {
    return CITY_TO_TIMING_COUNTRY[city];
  }

  const blob = `${input.destinationLabel ?? ""} ${input.country}`.toLowerCase();
  for (const [name, key] of Object.entries(COUNTRY_NAME_TO_TIMING_KEY)) {
    if (blob.includes(name)) {
      return key;
    }
  }

  return null;
};

const dedupeRuleInsights = (insights: TravelTimingInsight[]): TravelTimingInsight[] => {
  const byKey = new Map<string, TravelTimingInsight>();
  for (const ins of insights) {
    const k = `${ins.type}|${ins.message}`;
    const prev = byKey.get(k);
    if (!prev || ins.confidence > prev.confidence) {
      byKey.set(k, ins);
    }
  }
  return [...byKey.values()];
};

/**
 * Deterministic detection from the knowledge base only — no network, no guesses for unknown places.
 */
export const analyzeTravelTimingRaw = (input: AnalyzeTravelTimingInput): TravelTimingInsight[] => {
  const countryKey = resolveTimingCountryKey({
    country: input.country,
    city: input.city,
    destinationLabel: input.destinationLabel,
  });
  if (!countryKey) {
    return [];
  }

  const range = input.dateRange;
  if (!range.start?.trim() || !range.end?.trim()) {
    return [];
  }

  const matched: TravelTimingInsight[] = [];
  for (const rule of STATIC_TIMING_RULES) {
    if (!rule.countries.includes(countryKey)) {
      continue;
    }
    if (tripTouchesRule(range, rule)) {
      matched.push(timingRuleToInsight(rule));
    }
  }

  return dedupeRuleInsights(matched);
};

export const analyzeTravelTiming = (input: AnalyzeTravelTimingInput): TravelTimingInsight[] => {
  const raw = analyzeTravelTimingRaw(input);
  return refineTravelTimingInsights(raw, input);
};

const tripDurationDays = (range: TravelTimingDateRange): number => {
  const start = dayjs(range.start);
  const end = dayjs(range.end);
  if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) {
    return 0;
  }
  return end.diff(start, "day") + 1;
};

const hardInsightCount = (insights: TravelTimingInsight[]): number => insights.filter((i) => i.severity !== "info").length;

/**
 * Searches nearby calendar shifts (± weeks) for the same trip length with strictly fewer hard insights
 * (warnings/critical) than the current window. Returns [] when the current window is already clean or unknown.
 */
export const suggestBetterDates = (input: SuggestBetterDatesInput): BetterDateWindow[] => {
  const countryKey = resolveTimingCountryKey({
    country: input.country,
    city: input.city,
    destinationLabel: input.destinationLabel,
  });
  if (!countryKey) {
    return [];
  }

  const duration = tripDurationDays(input.currentDateRange);
  if (duration <= 0) {
    return [];
  }

  const start0 = dayjs(input.currentDateRange.start).startOf("day");
  if (!start0.isValid()) {
    return [];
  }

  const baseInput: AnalyzeTravelTimingInput = {
    country: input.country,
    city: input.city,
    destinationLabel: input.destinationLabel,
    dateRange: input.currentDateRange,
  };
  const currentHard = hardInsightCount(analyzeTravelTimingRaw(baseInput));
  if (currentHard === 0) {
    return [];
  }

  const today = dayjs().startOf("day");
  const shifts = [-56, -42, -28, -21, -14, 14, 21, 28, 42, 56, 70, 84, 112, 140, 168, 196, 224];
  const out: BetterDateWindow[] = [];
  const seen = new Set<string>();

  for (const shift of shifts) {
    const ns = start0.add(shift, "day");
    const ne = ns.add(duration - 1, "day");
    if (ne.isBefore(today, "day")) {
      continue;
    }
    const range: TravelTimingDateRange = { start: ns.format("YYYY-MM-DD"), end: ne.format("YYYY-MM-DD") };
    const nextHard = hardInsightCount(analyzeTravelTimingRaw({ ...baseInput, dateRange: range }));
    if (nextHard >= currentHard) {
      continue;
    }

    const key = `${range.start}|${range.end}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const label = shift < 0 ? `${Math.abs(shift)} days earlier` : `${shift} days later`;
    out.push({
      id: `better-${countryKey}-${key}`,
      label,
      start: range.start,
      end: range.end,
      rationale: "Same trip length with fewer timing friction hits in our on-device guide — still verify live prices and weather.",
    });

    if (out.length >= 3) {
      break;
    }
  }

  return out;
};

export type TripLikeDateEntity = {
  dateRange: TravelTimingDateRange;
  tripSegments: Array<{ startDate: string; endDate: string }>;
};

/**
 * Shifts all segment dates and the trip date range by the delta between old and new start dates.
 */
export const shiftTripLikeDateRange = <T extends TripLikeDateEntity>(entity: T, newRange: TravelTimingDateRange): T => {
  const oldStart = dayjs(entity.dateRange.start);
  const newStart = dayjs(newRange.start);
  const newEnd = dayjs(newRange.end);
  if (!oldStart.isValid() || !newStart.isValid() || !newEnd.isValid() || newEnd.isBefore(newStart, "day")) {
    return { ...entity, dateRange: newRange };
  }
  const deltaDays = newStart.diff(oldStart, "day");
  const newSegments = entity.tripSegments.map((seg) => {
    const s = dayjs(seg.startDate);
    const e = dayjs(seg.endDate);
    const nextStart = s.isValid() ? s.add(deltaDays, "day").format("YYYY-MM-DD") : seg.startDate;
    const nextEnd = e.isValid() ? e.add(deltaDays, "day").format("YYYY-MM-DD") : seg.endDate;
    return { ...seg, startDate: nextStart, endDate: nextEnd };
  });
  return { ...entity, dateRange: { start: newRange.start, end: newRange.end }, tripSegments: newSegments };
};
