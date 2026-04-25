import type { EventLookupResult } from "../../entities/events/eventLookup.model";
import type { FestivalSelection } from "../../entities/events/eventLookup.model";
import type { AnchorEventDraft } from "../../features/trips/validation/tripWizardValidation";
import type { MemoryAnchorEvent } from "../../entities/travel-memory/model";

export const mapLookupEventTypeToAnchorDraftType = (t: EventLookupResult["eventType"]): AnchorEventDraft["type"] => {
  switch (t) {
    case "concert":
      return "concert";
    case "festival":
    case "multi_day_festival":
      return "festival";
    case "venue_event":
      return "show";
    default:
      return "other";
  }
};

export const isMultiDayEventResult = (result: EventLookupResult): boolean =>
  Boolean(
    result.startDate &&
      result.endDate &&
      result.endDate !== result.startDate &&
      (result.eventType === "multi_day_festival" || result.eventType === "festival"),
  );

const shouldApply = (replaceAll: boolean, locked: boolean, current: string | undefined): boolean => {
  if (replaceAll) {
    return true;
  }
  if (locked) {
    return false;
  }
  return !current?.trim();
};

export interface ApplyAnchorDraftOptions {
  replaceAll: boolean;
  locks: Set<string>;
  festivalSelection?: FestivalSelection;
}

export const applyEventLookupToAnchorEventDraft = (
  draft: AnchorEventDraft,
  result: EventLookupResult,
  opts: ApplyAnchorDraftOptions,
): AnchorEventDraft => {
  const next: AnchorEventDraft = { ...draft };
  const lock = (k: string): boolean => opts.locks.has(k);

  if (shouldApply(opts.replaceAll, lock("title"), next.title)) {
    next.title = result.title;
  }
  if (shouldApply(opts.replaceAll, lock("artistOrSeries"), next.artistOrSeries)) {
    const a = result.artistName ?? result.festivalName;
    if (a) {
      next.artistOrSeries = a;
    }
  }
  if (shouldApply(opts.replaceAll, lock("type"), next.type)) {
    next.type = mapLookupEventTypeToAnchorDraftType(result.eventType);
  }
  if (shouldApply(opts.replaceAll, lock("city"), next.city)) {
    next.city = result.city ?? next.city;
  }
  if (shouldApply(opts.replaceAll, lock("country"), next.country)) {
    next.country = result.country ?? next.country;
  }
  if (shouldApply(opts.replaceAll, lock("venue"), next.venue)) {
    next.venue = result.venueName ?? next.venue;
  }
  if (shouldApply(opts.replaceAll, lock("date"), next.date)) {
    const sortedSel =
      opts.festivalSelection?.selectedDates?.length ? [...opts.festivalSelection.selectedDates].filter(Boolean).sort() : [];
    const start = sortedSel[0] ?? result.startDate;
    if (start) {
      next.date = start;
    }
  }
  if (opts.replaceAll || !lock("endDate")) {
    const sortedSel =
      opts.festivalSelection?.selectedDates?.length ? [...opts.festivalSelection.selectedDates].filter(Boolean).sort() : [];
    const end =
      sortedSel.length > 0 ? sortedSel[sortedSel.length - 1] : result.endDate;
    if (end && end !== next.date) {
      next.endDate = end;
    } else if (opts.replaceAll || !next.endDate?.trim()) {
      next.endDate = "";
    }
  }
  if (shouldApply(opts.replaceAll, lock("startTime"), next.startTime)) {
    next.startTime = result.startTime?.slice(0, 5) ?? next.startTime;
  }
  if (result.timezone && (opts.replaceAll || !lock("timezone"))) {
    next.timezone = result.timezone;
  }
  if (result.countryCode && (opts.replaceAll || !lock("countryCode"))) {
    next.countryCode = result.countryCode;
  }
  if (result.sourceUrl && (opts.replaceAll || !lock("sourceUrl"))) {
    next.sourceUrl = result.sourceUrl;
  }
  if (result.imageUrl && (opts.replaceAll || !lock("imageUrl"))) {
    next.imageUrl = result.imageUrl;
  }
  if (result.ticketUrl && (opts.replaceAll || !lock("ticketUrl"))) {
    next.ticketUrl = result.ticketUrl;
  }
  if (result.provider && (opts.replaceAll || !lock("provider"))) {
    next.provider = result.provider;
  }
  if (result.providerEventId && (opts.replaceAll || !lock("providerEventId"))) {
    next.providerEventId = result.providerEventId;
  }
  if (result.coordinates && (opts.replaceAll || !lock("coordinates"))) {
    next.latitude = result.coordinates.lat;
    next.longitude = result.coordinates.lng;
  }
  if (opts.festivalSelection) {
    next.festivalSelection = opts.festivalSelection;
  }
  return next;
};

export interface ApplyMemoryAnchorOptions {
  replaceAll: boolean;
  locks: Set<string>;
  festivalSelection?: FestivalSelection;
}

export const applyEventLookupToMemoryAnchor = (
  event: MemoryAnchorEvent,
  result: EventLookupResult,
  opts: ApplyMemoryAnchorOptions,
): MemoryAnchorEvent => {
  const next: MemoryAnchorEvent = { ...event };
  const lock = (k: string): boolean => opts.locks.has(k);

  if (shouldApply(opts.replaceAll, lock("title"), next.title)) {
    next.title = result.title;
  }
  if (shouldApply(opts.replaceAll, lock("artistName"), next.artistName)) {
    if (result.artistName) {
      next.artistName = result.artistName;
    }
  }
  if (shouldApply(opts.replaceAll, lock("festivalName"), next.festivalName)) {
    if (result.festivalName) {
      next.festivalName = result.festivalName;
    }
  }
  if (shouldApply(opts.replaceAll, lock("city"), next.city)) {
    next.city = result.city ?? next.city;
  }
  if (shouldApply(opts.replaceAll, lock("country"), next.country)) {
    next.country = result.country ?? next.country;
  }
  if (shouldApply(opts.replaceAll, lock("venue"), next.venue)) {
    next.venue = result.venueName ?? next.venue;
  }
  if (shouldApply(opts.replaceAll, lock("eventDate"), next.eventDate)) {
    const sortedSel =
      opts.festivalSelection?.selectedDates?.length ? [...opts.festivalSelection.selectedDates].filter(Boolean).sort() : [];
    next.eventDate = sortedSel[0] ?? result.startDate ?? next.eventDate;
  }
  if (opts.replaceAll || !lock("endDate")) {
    const sortedSel =
      opts.festivalSelection?.selectedDates?.length ? [...opts.festivalSelection.selectedDates].filter(Boolean).sort() : [];
    const end = sortedSel.length > 0 ? sortedSel[sortedSel.length - 1] : result.endDate;
    if (end && end !== next.eventDate) {
      next.endDate = end;
    } else if (opts.replaceAll) {
      next.endDate = undefined;
    }
  }
  if (shouldApply(opts.replaceAll, lock("startTime"), next.startTime)) {
    next.startTime = result.startTime?.slice(0, 5);
  }
  if (result.countryCode && (opts.replaceAll || !lock("countryCode"))) {
    next.countryCode = result.countryCode;
  }
  if (result.timezone && (opts.replaceAll || !lock("timezone"))) {
    next.timezone = result.timezone;
  }
  if (result.sourceUrl && (opts.replaceAll || !lock("sourceUrl"))) {
    next.sourceUrl = result.sourceUrl;
  }
  if (result.imageUrl && (opts.replaceAll || !lock("imageUrl"))) {
    next.imageUrl = result.imageUrl;
  }
  if (result.ticketUrl && (opts.replaceAll || !lock("ticketUrl"))) {
    next.ticketUrl = result.ticketUrl;
  }
  if (result.provider && (opts.replaceAll || !lock("provider"))) {
    next.provider = result.provider;
  }
  if (result.providerEventId && (opts.replaceAll || !lock("providerEventId"))) {
    next.providerEventId = result.providerEventId;
  }
  if (result.eventType && (opts.replaceAll || !lock("eventType"))) {
    next.eventType = result.eventType;
  }
  if (result.coordinates && (opts.replaceAll || !lock("coordinates"))) {
    next.latitude = result.coordinates.lat;
    next.longitude = result.coordinates.lng;
  }
  if (opts.festivalSelection) {
    next.festivalSelection = opts.festivalSelection;
  }
  return next;
};
