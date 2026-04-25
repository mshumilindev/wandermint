import type { TFunction } from "i18next";
import dayjs from "dayjs";
import type { TravelMemory } from "../../entities/travel-memory/model";

const ordinal = (dayOfMonth: number): string => {
  const teen = dayOfMonth % 100;
  if (teen > 10 && teen < 14) {
    return `${dayOfMonth}th`;
  }
  switch (dayOfMonth % 10) {
    case 1:
      return `${dayOfMonth}st`;
    case 2:
      return `${dayOfMonth}nd`;
    case 3:
      return `${dayOfMonth}rd`;
    default:
      return `${dayOfMonth}th`;
  }
};

const monthDayOrdinalYear = (value: dayjs.Dayjs): string =>
  `${value.format("MMMM")} ${ordinal(value.date())}, ${value.format("YYYY")}`;

const monthDayOrdinal = (value: dayjs.Dayjs): string => `${value.format("MMMM")} ${ordinal(value.date())}`;

/** User-facing trip dates for travel memories (English phrasing via i18n). */
export const formatTravelMemoryRange = (memory: TravelMemory, t: TFunction): string => {
  const start = dayjs(memory.startDate);
  const end = dayjs(memory.endDate);

  if (!start.isValid() || !end.isValid()) {
    return memory.datePrecision === "month"
      ? memory.startDate.slice(0, 7)
      : t("travelStats.friendlyDate.fallbackRange", { start: memory.startDate, end: memory.endDate });
  }

  if (memory.datePrecision === "month") {
    if (start.isSame(end, "month")) {
      return t("travelStats.friendlyDate.monthSingle", { month: start.format("MMMM"), year: start.format("YYYY") });
    }

    return t("travelStats.friendlyDate.monthSpan", {
      start: `${start.format("MMMM")} ${start.format("YYYY")}`,
      end: `${end.format("MMMM")} ${end.format("YYYY")}`,
    });
  }

  if (start.isSame(end, "day")) {
    return t("travelStats.friendlyDate.singleDay", { date: monthDayOrdinalYear(start) });
  }

  if (start.isSame(end, "year")) {
    return t("travelStats.friendlyDate.sameYear", {
      from: monthDayOrdinal(start),
      to: monthDayOrdinal(end),
      year: end.format("YYYY"),
    });
  }

  return t("travelStats.friendlyDate.fullSpan", {
    from: monthDayOrdinalYear(start),
    to: monthDayOrdinalYear(end),
  });
};
