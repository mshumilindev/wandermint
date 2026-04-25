export type TravelTimingInsightType =
  | "weather_risk"
  | "bad_season"
  | "peak_prices"
  | "crowds"
  | "shoulder_opportunity";

export type TravelTimingSeverity = "info" | "warning" | "critical";

export type TravelTimingInsight = {
  type: TravelTimingInsightType;
  severity: TravelTimingSeverity;
  message: string;
  recommendation?: string;
  confidence: number;
};

export type TravelTimingDateRange = {
  start: string;
  end: string;
};

export type AnalyzeTravelTimingInput = {
  /** Free-text destination line (optional helper for city→country inference). */
  destinationLabel?: string;
  country: string;
  city?: string;
  dateRange: TravelTimingDateRange;
};

export type BetterDateWindow = {
  id: string;
  label: string;
  start: string;
  end: string;
  rationale: string;
};

export type SuggestBetterDatesInput = {
  country: string;
  city?: string;
  destinationLabel?: string;
  currentDateRange: TravelTimingDateRange;
};
