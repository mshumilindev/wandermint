import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

import type { Trip } from "../../../entities/trip/model";

export const formatDateInTimeZone = (now: Date, timeZone: string): string =>
  dayjs(now).tz(timeZone).format("YYYY-MM-DD");

export const resolvePlanTimezone = (trip: Trip | null | undefined, segmentId: string): string => {
  const entry = trip?.travelSupport?.timezones?.find((item) => item.segmentId === segmentId);
  if (entry?.timezone && entry.timezone.trim().length > 0) {
    return entry.timezone.trim();
  }
  const dest = trip?.destination?.toLowerCase() ?? "";
  if (dest.includes("warsaw") || dest.includes("poland")) {
    return "Europe/Warsaw";
  }
  if (dest.includes("london") || dest.includes("uk")) {
    return "Europe/London";
  }
  if (dest.includes("paris") || dest.includes("france")) {
    return "Europe/Paris";
  }
  if (dest.includes("porto") || dest.includes("lisbon") || dest.includes("portugal")) {
    return "Europe/Lisbon";
  }
  return "UTC";
};

export const timeToMinutes = (hhmm: string): number => {
  const [hRaw, mRaw] = hhmm.split(":").map((part) => Number(part.trim()));
  const hours = Number.isFinite(hRaw) ? (hRaw as number) : 0;
  const minutes = Number.isFinite(mRaw) ? (mRaw as number) : 0;
  return hours * 60 + minutes;
};

export const planLocalDateTime = (dayDate: string, hhmm: string, timeZone: string): dayjs.Dayjs =>
  dayjs.tz(`${dayDate}T${hhmm}:00`, timeZone);

export const minutesBetween = (a: dayjs.Dayjs, b: dayjs.Dayjs): number => b.diff(a, "minute", true);
