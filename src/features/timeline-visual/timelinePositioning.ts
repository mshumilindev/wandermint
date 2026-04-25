import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import { formatDateInTimeZone } from "../trips/pacing/planTimeUtils";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import type {
  NowLineProps,
  TimelineItemBounds,
  TimelineLayout,
  TimelineNowLineResult,
  TimelinePositionedItem,
  TimelineTravelSegment,
} from "./DayTimeline.types";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Pixels per hour — vertical scale is proportional to real duration. */
export const TIMELINE_PX_PER_HOUR = 72;

/** Minimum event block height (keeps short events readable, including under 15 minutes). */
export const TIMELINE_MIN_BLOCK_HEIGHT_PX = 28;

const pad2 = (n: number): string => String(n).padStart(2, "0");

const windowStartInstant = (date: string, startHour: number, timeZone: string): dayjs.Dayjs =>
  dayjs.tz(`${date}T${pad2(startHour)}:00:00`, timeZone);

const windowEndInstant = (date: string, endHour: number, timeZone: string): dayjs.Dayjs => {
  if (endHour >= 24) {
    return dayjs.tz(`${date}T00:00:00`, timeZone).add(1, "day");
  }
  return dayjs.tz(`${date}T${pad2(endHour)}:00:00`, timeZone);
};

export const parseItemTimeRange = (item: TripPlanItem, timeZone: string): Omit<TimelineItemBounds, "item"> & { item: TripPlanItem } => {
  const start = dayjs(item.plannedStartTime).tz(timeZone);
  const end = dayjs(item.plannedEndTime).tz(timeZone);
  if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
    return { item, startMs: 0, endMs: 0, scheduled: false };
  }
  return { item, startMs: start.valueOf(), endMs: end.valueOf(), scheduled: true };
};

export const collectItemBounds = (items: TripPlanItem[], timeZone: string): TimelineItemBounds[] =>
  items.map((item) => {
    const r = parseItemTimeRange(item, timeZone);
    return { item: r.item, startMs: r.startMs, endMs: r.endMs, scheduled: r.scheduled };
  });

const durationMinutes = (startMs: number, endMs: number): number => Math.max(0, (endMs - startMs) / 60_000);

/** Expand default window to cover all scheduled items (wall clock in `timeZone`). */
export const suggestTimelineHours = (
  items: TripPlanItem[],
  timeZone: string,
  defaultStart = 7,
  defaultEnd = 22,
): { startHour: number; endHour: number } => {
  const bounds = collectItemBounds(items, timeZone).filter((b) => b.scheduled && b.endMs > b.startMs);
  if (bounds.length === 0) {
    return { startHour: defaultStart, endHour: defaultEnd };
  }
  let minFrac = 24;
  let maxFrac = 0;
  for (const b of bounds) {
    const s = dayjs(b.startMs).tz(timeZone);
    const e = dayjs(b.endMs).tz(timeZone);
    minFrac = Math.min(minFrac, s.hour() + s.minute() / 60 + s.second() / 3600);
    maxFrac = Math.max(maxFrac, e.hour() + e.minute() / 60 + e.second() / 3600);
  }
  const startHour = Math.max(0, Math.min(defaultStart, Math.floor(minFrac) - 1));
  const endHour = Math.min(24, Math.max(defaultEnd, Math.ceil(maxFrac) + 1));
  return { startHour, endHour };
};

export const detectAnyOverlap = (bounds: TimelineItemBounds[]): boolean => {
  const scheduled = bounds.filter((b) => b.scheduled && b.endMs > b.startMs);
  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      const a = scheduled[i]!;
      const c = scheduled[j]!;
      if (a.startMs < c.endMs && c.startMs < a.endMs) {
        return true;
      }
    }
  }
  return false;
};

type ClipEntry = { startMs: number; endMs: number; index: number };

const assignOverlapLanes = (entries: ClipEntry[]): { lane: number; laneCount: number }[] => {
  const sorted = entries.filter((e) => e.endMs > e.startMs).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const laneEnds: number[] = [];
  const laneByIndex = new Map<number, number>();
  for (const e of sorted) {
    let lane = laneEnds.findIndex((end) => end <= e.startMs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.endMs);
    } else {
      laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, e.endMs);
    }
    laneByIndex.set(e.index, lane);
  }
  const laneCount = Math.max(1, laneEnds.length);
  return entries.map((_, i) => ({
    lane: laneByIndex.get(i) ?? 0,
    laneCount,
  }));
};

export const computeTimelineNowLine = (
  props: NowLineProps & { windowStartMs: number; windowEndMs: number; trackHeightPx: number },
): TimelineNowLineResult => {
  const { currentTime, date, timezone, windowStartMs, windowEndMs, trackHeightPx } = props;
  const now = dayjs(currentTime).tz(timezone);
  if (!now.isValid()) {
    return { linePx: null, showBeforeHint: false, showAfterHint: false, isTimelineDay: false };
  }
  const todayStr = formatDateInTimeZone(now.toDate(), timezone);
  const isTimelineDay = todayStr === date;
  if (!isTimelineDay) {
    return { linePx: null, showBeforeHint: false, showAfterHint: false, isTimelineDay: false };
  }
  const ms = now.valueOf();
  if (ms < windowStartMs) {
    return { linePx: null, showBeforeHint: true, showAfterHint: false, isTimelineDay: true };
  }
  if (ms >= windowEndMs) {
    return { linePx: null, showBeforeHint: false, showAfterHint: true, isTimelineDay: true };
  }
  const windowMinutes = (windowEndMs - windowStartMs) / 60_000;
  const pxPerMinute = trackHeightPx / Math.max(1e-9, windowMinutes);
  const linePx = ((ms - windowStartMs) / 60_000) * pxPerMinute;
  return { linePx, showBeforeHint: false, showAfterHint: false, isTimelineDay: true };
};

export const buildTimelineLayout = (
  date: string,
  timeZone: string,
  startHour: number,
  endHour: number,
  items: TripPlanItem[],
): TimelineLayout => {
  const winStart = windowStartInstant(date, startHour, timeZone);
  const winEnd = windowEndInstant(date, endHour, timeZone);
  const windowStartMs = winStart.valueOf();
  const windowEndMs = winEnd.valueOf();
  const windowMinutes = Math.max(1, (windowEndMs - windowStartMs) / 60_000);
  const pxPerMinute = TIMELINE_PX_PER_HOUR / 60;
  const trackHeightPx = (windowMinutes / 60) * TIMELINE_PX_PER_HOUR;

  const rawBounds = collectItemBounds(items, timeZone);
  const unscheduled: TripPlanItem[] = [];
  const scheduledBounds: TimelineItemBounds[] = [];
  for (const b of rawBounds) {
    if (!b.scheduled || b.endMs <= b.startMs) {
      unscheduled.push(b.item);
    } else {
      scheduledBounds.push(b);
    }
  }

  type VisibleRow = { bound: TimelineItemBounds; effStart: number; effEnd: number };
  const visibleRows: VisibleRow[] = [];
  for (const b of scheduledBounds) {
    const effStart = Math.max(b.startMs, windowStartMs);
    const effEnd = Math.min(b.endMs, windowEndMs);
    if (effEnd <= effStart) {
      continue;
    }
    visibleRows.push({ bound: b, effStart, effEnd });
  }

  const clipEntries: ClipEntry[] = visibleRows.map((row, i) => ({
    startMs: row.effStart,
    endMs: row.effEnd,
    index: i,
  }));

  const hasOverlap = detectAnyOverlap(scheduledBounds);
  const lanes = assignOverlapLanes(clipEntries);

  const positioned: TimelinePositionedItem[] = [];
  visibleRows.forEach((row, i) => {
    const { bound: b, effStart, effEnd } = row;
    const durMin = durationMinutes(effStart, effEnd);
    const rawHeight = durMin * pxPerMinute;
    const heightPx = Math.max(TIMELINE_MIN_BLOCK_HEIGHT_PX, rawHeight);
    const topPx = ((effStart - windowStartMs) / 60_000) * pxPerMinute;
    const { lane, laneCount } = lanes[i] ?? { lane: 0, laneCount: 1 };
    positioned.push({
      item: b.item,
      topPx,
      heightPx,
      lane,
      laneCount,
      clippedStart: b.startMs < windowStartMs,
      clippedEnd: b.endMs > windowEndMs,
    });
  });

  const laneByItemId = new Map(positioned.map((p) => [p.item.id, { lane: p.lane, laneCount: p.laneCount }]));

  const sorted = [...scheduledBounds].sort((a, c) => a.startMs - c.startMs);
  const travel: TimelineTravelSegment[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const gapStart = Math.max(prev.endMs, windowStartMs);
    const gapEnd = Math.min(cur.startMs, windowEndMs);
    if (gapEnd <= gapStart) {
      continue;
    }
    const gapMin = durationMinutes(gapStart, gapEnd);
    const topPx = ((gapStart - windowStartMs) / 60_000) * pxPerMinute;
    const heightPx = Math.max(6, gapMin * pxPerMinute);
    const lanePack = laneByItemId.get(cur.item.id) ?? laneByItemId.get(prev.item.id) ?? { lane: 0, laneCount: 1 };
    travel.push({
      id: `travel-${prev.item.id}-${cur.item.id}`,
      topPx,
      heightPx,
      minutes: Math.round(gapMin),
      lane: lanePack.lane,
      laneCount: lanePack.laneCount,
    });
  }

  return {
    windowStartMs,
    windowEndMs,
    windowMinutes,
    trackHeightPx,
    pxPerMinute,
    positioned,
    travel,
    unscheduled,
    hasOverlap: hasOverlap,
  };
};
