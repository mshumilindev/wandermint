export type OpeningHours = {
  /** IANA timezone for interpreting wall times and special closure dates. */
  timezone: string;
  /** Original provider label used to build `periods` (re-parsed for validation). */
  sourceLabel: string;
  periods: {
    /** 0 = Sunday … 6 = Saturday (aligned with JS `Date.getUTCDay` / local weekday in `timezone`). */
    day: number;
    open: string;
    close: string;
  }[];
  specialClosures?: {
    date: string;
    reason?: string;
  }[];
};

export type OpeningHoursValidationStatus = "open" | "closed" | "unknown";

export type OpeningHoursValidationResult = {
  status: OpeningHoursValidationStatus;
  reason?: string;
  /** ISO instant in UTC for the next plausible opening start (best-effort). */
  nextOpenTime?: string;
};

export type PlanSlotOpeningHoursCheck = {
  result: OpeningHoursValidationResult;
  /** True when the place is deterministically closed for the entire planned window. */
  slotInvalid: boolean;
};
