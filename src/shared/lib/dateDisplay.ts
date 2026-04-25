const EN_MONTH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const ordinal = (day: number): string => {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) {
    return `${day}th`;
  }
  const rem10 = day % 10;
  if (rem10 === 1) return `${day}st`;
  if (rem10 === 2) return `${day}nd`;
  if (rem10 === 3) return `${day}rd`;
  return `${day}th`;
};

const parseIsoDateOnly = (iso: string): Date | null => {
  const value = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatEnDate = (date: Date, withYear: boolean): string => {
  const month = EN_MONTH[date.getUTCMonth()] ?? "";
  const day = ordinal(date.getUTCDate());
  const year = date.getUTCFullYear();
  return withYear ? `${month} ${day} ${year}` : `${month} ${day}`;
};

/**
 * Converts `YYYY-MM-DD` range to:
 * - `From May 12th till May 18th 2026` (same year)
 * - `From December 30th 2026 till January 2nd 2027` (different years)
 */
export const formatUserFriendlyDateRange = (startIso: string, endIso: string): string => {
  const start = parseIsoDateOnly(startIso);
  const end = parseIsoDateOnly(endIso);
  if (!start || !end) {
    return `${startIso} - ${endIso}`.trim();
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (sameYear) {
    return `From ${formatEnDate(start, false)} till ${formatEnDate(end, true)}`;
  }
  return `From ${formatEnDate(start, true)} till ${formatEnDate(end, true)}`;
};

