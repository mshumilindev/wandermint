import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import { dayPlanToTripDayTimeline, validateTripDayTimeline } from "../trip-planning/timeline/timelineValidator";
import type {
  ExportDayTimelineCheck,
  ExportItineraryFailure,
  ExportItineraryOptions,
  ExportItineraryResult,
  ExportItinerarySuccess,
} from "./export.types";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const CRLF = "\r\n";

const escapeIcsText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

const foldLine = (line: string): string => {
  if (line.length <= 75) {
    return line;
  }
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  chunks.push(rest);
  return chunks.join(CRLF);
};

const formatIcsDateTimeWithTzid = (dayDate: string, wallHm: string, tz: string): string | null => {
  const trimmed = wallHm.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null;
  }
  const wall = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const local = dayjs.tz(`${dayDate} ${wall}`, "YYYY-MM-DD HH:mm", tz);
  if (!local.isValid()) {
    return null;
  }
  return `${local.format("YYYYMMDD")}T${local.format("HHmmss")}`;
};

const buildAddress = (block: ActivityBlock): string | undefined => {
  const p = block.place;
  if (!p) {
    return undefined;
  }
  const parts = [p.address, p.city, p.country].filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(", ");
};

const buildNotes = (
  block: ActivityBlock,
  options: ExportItineraryOptions,
  globalInfeasibleWarning: string | undefined,
): string => {
  const lines: string[] = [];
  if (globalInfeasibleWarning) {
    lines.push(globalInfeasibleWarning);
    lines.push("");
  }
  if (block.description.trim()) {
    lines.push(block.description.trim());
  }
  if (block.category) {
    lines.push(`Category: ${block.category}`);
  }
  if (block.tags.length > 0) {
    lines.push(`Tags: ${block.tags.join(", ")}`);
  }
  const booking = options.getBookingUrl?.(block);
  if (booking) {
    lines.push(`Booking: ${booking}`);
  }
  return lines.join("\n").trim();
};

const sanitizeFilename = (title: string): string => {
  const base = title
    .trim()
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base.length > 0 ? base.slice(0, 80) : "itinerary";
};

const buildVEvent = (
  tripId: string,
  day: DayPlan,
  block: ActivityBlock,
  tz: string,
  options: ExportItineraryOptions,
  globalInfeasibleWarning: string | undefined,
): string | null => {
  const start = formatIcsDateTimeWithTzid(day.date, block.startTime, tz);
  const end = formatIcsDateTimeWithTzid(day.date, block.endTime, tz);
  if (!start || !end) {
    return null;
  }

  const uid = `${encodeURIComponent(tripId)}-${encodeURIComponent(block.id)}@wandermint`;
  const dtStamp = dayjs.utc().format("YYYYMMDDTHHmmss") + "Z";
  const location = buildAddress(block);
  const notes = buildNotes(block, options, globalInfeasibleWarning);
  const bookingUrl = options.getBookingUrl?.(block);

  const lines: string[] = ["BEGIN:VEVENT", foldLine(`UID:${uid}`), `DTSTAMP:${dtStamp}`];
  lines.push(foldLine(`DTSTART;TZID=${tz}:${start}`));
  lines.push(foldLine(`DTEND;TZID=${tz}:${end}`));
  lines.push(foldLine(`SUMMARY:${escapeIcsText(block.title || "Untitled")}`));
  if (location) {
    lines.push(foldLine(`LOCATION:${escapeIcsText(location)}`));
  }
  if (notes) {
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(notes)}`));
  }
  if (bookingUrl && /^https?:\/\//i.test(bookingUrl)) {
    lines.push(foldLine(`URL:${bookingUrl}`));
  }
  const lat = block.place?.latitude;
  const lng = block.place?.longitude;
  if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
    lines.push(`GEO:${lat.toFixed(6)};${lng.toFixed(6)}`);
  }
  lines.push("END:VEVENT");
  return lines.join(CRLF);
};

const collectDayChecks = (days: readonly DayPlan[]): ExportDayTimelineCheck[] =>
  days.map((dayPlan) => ({
    dayPlan,
    validation: validateTripDayTimeline(dayPlanToTripDayTimeline(dayPlan)),
  }));

const infeasibleSummary = (checks: ExportDayTimelineCheck[]): string => {
  const bad = checks.filter((c) => !c.validation.isFeasible);
  const dates = bad.map((b) => b.dayPlan.date).join(", ");
  return `One or more days failed feasibility checks (${dates}). Enable allowInfeasibleExportWithWarning to export with warnings embedded in event descriptions.`;
};

const globalWarningBanner = (checks: ExportDayTimelineCheck[]): string => {
  const bullets = checks
    .filter((c) => !c.validation.isFeasible)
    .flatMap((c) => c.validation.warnings.map((w) => `- ${w.message}`));
  if (bullets.length === 0) {
    return `[INFEASIBLE SCHEDULE — WanderMint]\n- The planner marked one or more days as overloaded or inconsistent. Review times in WanderMint before relying on this export.\n`;
  }
  return `[INFEASIBLE SCHEDULE — WanderMint]\n${bullets.join("\n")}\n`;
};

/**
 * Builds a single VCALENDAR containing one VEVENT per itinerary block (meal, activity, rest, transfer).
 * Uses `DTSTART;TZID` / `DTEND;TZID` so local wall times stay in the intended IANA zone.
 */
export const exportToICS = (days: readonly DayPlan[], options: ExportItineraryOptions): ExportItineraryResult => {
  const tripId = options.tripId.trim();
  if (!tripId) {
    throw new TypeError("exportToICS requires options.tripId.");
  }
  const defaultTz = options.defaultTimezone.trim();
  if (!defaultTz) {
    throw new TypeError("exportToICS requires options.defaultTimezone (IANA).");
  }

  const dayChecks = collectDayChecks(days);
  const anyInfeasible = dayChecks.some((c) => !c.validation.isFeasible);

  if (anyInfeasible && !options.allowInfeasibleExportWithWarning) {
    const failure: ExportItineraryFailure = {
      ok: false,
      code: "infeasible_timeline",
      message: infeasibleSummary(dayChecks),
      dayChecks,
    };
    return failure;
  }

  const globalBanner = anyInfeasible && options.allowInfeasibleExportWithWarning ? globalWarningBanner(dayChecks) : undefined;

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WanderMint//Trip itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ].join(CRLF);

  const events: string[] = [];
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of sortedDays) {
    const tz = options.timezoneForDay?.(day)?.trim() || defaultTz;
    const blocks = [...day.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (const block of blocks) {
      const ve = buildVEvent(tripId, day, block, tz, options, globalBanner);
      if (ve) {
        events.push(ve);
      }
    }
  }

  const ics = [header, ...events, "END:VCALENDAR"].join(CRLF) + CRLF;

  const success: ExportItinerarySuccess = {
    ok: true,
    ics,
    suggestedFilename: `${sanitizeFilename(options.tripTitle)}.ics`,
    dayChecks,
    exportedWithInfeasibleWarning: Boolean(anyInfeasible && options.allowInfeasibleExportWithWarning),
  };
  return success;
};
