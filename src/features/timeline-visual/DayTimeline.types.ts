import type { TripPlanItem } from "../trip-execution/decisionEngine.types";

/** Inputs for mapping “now” onto the vertical day track. */
export type NowLineProps = {
  currentTime: string;
  date: string;
  timezone: string;
  startHour: number;
  endHour: number;
};

export type DayTimelineProps = {
  date: string;
  timezone: string;
  startHour: number;
  endHour: number;
  items: TripPlanItem[];
  /** When false, hides the moving “now” line and day-boundary hints (e.g. shared link without live status). */
  showNowIndicator?: boolean;
  /** When true, omit any interactive controls. */
  readonly?: boolean;
};

export type TimelineNowLineResult = {
  /** Y offset in px inside the track, or null when the line should not render. */
  linePx: number | null;
  showBeforeHint: boolean;
  showAfterHint: boolean;
  /** `currentTime` falls on the same calendar day as `date` in `timezone`. */
  isTimelineDay: boolean;
};

export type TimelineItemBounds = {
  item: TripPlanItem;
  startMs: number;
  endMs: number;
  /** False when times are missing or not parseable for this day. */
  scheduled: boolean;
};

export type TimelinePositionedItem = {
  item: TripPlanItem;
  topPx: number;
  heightPx: number;
  lane: number;
  laneCount: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

export type TimelineTravelSegment = {
  id: string;
  topPx: number;
  heightPx: number;
  minutes: number;
  lane: number;
  laneCount: number;
};

export type TimelineLayout = {
  windowStartMs: number;
  windowEndMs: number;
  windowMinutes: number;
  trackHeightPx: number;
  pxPerMinute: number;
  positioned: TimelinePositionedItem[];
  travel: TimelineTravelSegment[];
  unscheduled: TripPlanItem[];
  /** True when at least one pair of scheduled items overlaps in time. */
  hasOverlap: boolean;
};
