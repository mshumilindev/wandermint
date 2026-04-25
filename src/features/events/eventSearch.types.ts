import type { FestivalSelection } from "../../entities/events/eventLookup.model";

export type EventSearchResultType = "concert" | "festival" | "show" | "sports" | "other";

/**
 * Normalized row for UI + autofill. `source` and `confidenceScore` are for internal ranking and QA;
 * they may combine multiple providers after deduplication.
 */
export type EventSearchResult = {
  id: string;
  title: string;
  type: EventSearchResultType;
  venueName: string;
  city: string;
  country: string;
  startDate: string;
  endDate?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  imageUrl?: string;
  source: string;
  confidenceScore: number;
  /** Preserved from provider rows for one-click autofill (not shown as primary UI fields). */
  providerEventId?: string;
  sourceUrl?: string;
  ticketUrl?: string;
  startTime?: string;
  timezone?: string;
  lineup?: string[];
  description?: string;
};

/** Trip hints for ranking and filtering (destination + optional trip window). */
export type TripEventSearchContext = {
  tripCity?: string;
  /** ISO-3166 alpha-2 or human label; matching is case-insensitive. */
  tripCountry?: string;
  tripStartDate?: string;
  tripEndDate?: string;
};

export type FestivalAttendanceMode = "all_days" | "single_day" | "multiple_days";

/**
 * Explicit festival attendance. `selectedDates` is always the canonical list of days
 * the user is attending (never implied from range alone except when `mode === "all_days"`
 * and `selectedDates` lists every calendar day in the festival span).
 */
export type FestivalDateSelection = {
  mode: FestivalAttendanceMode;
  selectedDates: string[];
  festivalRangeStart: string;
  festivalRangeEnd: string;
};

/** Persisted `FestivalSelection` uses `specific_days` for both single- and multi-day picks. */
export const festivalDateSelectionToPersisted = (sel: FestivalDateSelection): FestivalSelection => ({
  mode: sel.mode === "all_days" ? "all_days" : "specific_days",
  selectedDates: [...sel.selectedDates].filter(Boolean).sort(),
  originalStartDate: sel.festivalRangeStart,
  originalEndDate: sel.festivalRangeEnd,
});

export const persistedFestivalSelectionToDateSelection = (sel: FestivalSelection): FestivalDateSelection => {
  const mode: FestivalAttendanceMode =
    sel.mode === "all_days"
      ? "all_days"
      : sel.selectedDates.length <= 1
        ? "single_day"
        : "multiple_days";
  return {
    mode,
    selectedDates: [...sel.selectedDates],
    festivalRangeStart: sel.originalStartDate,
    festivalRangeEnd: sel.originalEndDate,
  };
};

export const isMultiDayFestivalResult = (e: EventSearchResult): boolean =>
  e.type === "festival" &&
  Boolean(e.endDate) &&
  toDateOnly(e.endDate ?? "") > toDateOnly(e.startDate);

export const toDateOnly = (isoOrDate: string): string => {
  const trimmed = isoOrDate.trim();
  const d = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : trimmed;
};

/**
 * Default when user has not chosen yet: **one** festival day (first calendar day), not the full run.
 */
export const defaultFestivalDateSelection = (e: EventSearchResult): FestivalDateSelection | null => {
  if (!isMultiDayFestivalResult(e)) {
    return null;
  }
  const start = toDateOnly(e.startDate);
  const end = toDateOnly(e.endDate ?? e.startDate);
  const days = enumerateInclusiveDates(start, end);
  const firstDay = days[0] ?? start;
  if (!firstDay) {
    return null;
  }
  return {
    mode: "single_day",
    selectedDates: [firstDay],
    festivalRangeStart: start,
    festivalRangeEnd: end,
  };
};

export const enumerateInclusiveDates = (start: string, end: string): string[] => {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (!a || !b) {
    return start ? [toDateOnly(start)] : [];
  }
  let t0 = a.getTime();
  let t1 = b.getTime();
  if (t0 > t1) {
    const swap = t0;
    t0 = t1;
    t1 = swap;
  }
  const out: string[] = [];
  let t = t0;
  const endMs = t1;
  const step = 86400000;
  let guard = 0;
  while (t <= endMs && guard < 40) {
    out.push(ymdFromUtc(t));
    t += step;
    guard += 1;
  }
  return out.length > 0 ? out : [toDateOnly(start)];
};

const parseYmd = (s: string): Date | null => {
  const d = toDateOnly(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) {
    return null;
  }
  const dt = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt) ? null : new Date(dt);
};

const ymdFromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
