import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import type { ActivityBlock, MovementLeg } from "../../../entities/activity/model";
import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip, TravelExecutionProfile } from "../../../entities/trip/model";
import type { ReplanResult } from "../../trip-execution/replanning/replanTrip.types";
import type { TripExecutionEnergyLevel, TripExecutionState, TripPlanItem, TripPlanPriority } from "../../trip-execution/decisionEngine.types";
import { resolvePlanTimezone, timeToMinutes } from "../pacing/planTimeUtils";

dayjs.extend(utc);
dayjs.extend(timezone);

const mapPriority = (p: ActivityBlock["priority"]): TripPlanPriority => {
  if (p === "must") {
    return "must";
  }
  if (p === "should") {
    return "high";
  }
  return "medium";
};

const hasBlockLatLng = (block: ActivityBlock): boolean => {
  const lat = block.place?.latitude;
  const lng = block.place?.longitude;
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
};

const mapExplorationToMode = (profile?: TravelExecutionProfile): TripExecutionState["userMode"] => {
  const speed = profile?.explorationSpeed ?? "standard";
  if (speed === "slow") {
    return "slow";
  }
  if (speed === "very_fast" || speed === "fast") {
    return "fast";
  }
  return "balanced";
};

const legToBlock = (legs: MovementLeg[] | undefined, toBlockId: string): MovementLeg | undefined =>
  legs?.find((leg) => leg.toBlockId === toBlockId);

const durationFromTimes = (start: string, end: string): number => {
  let a = timeToMinutes(start);
  let b = timeToMinutes(end);
  if (b < a) {
    b += 24 * 60;
  }
  return Math.max(15, b - a);
};

const wallIso = (dayDate: string, hhmm: string, timeZone: string): string => {
  const t = hhmm.trim();
  const withSeconds = t.split(":").length >= 3 ? t : `${t}:00`;
  return dayjs.tz(`${dayDate}T${withSeconds}`, timeZone).toISOString();
};

const isoToWallHHmm = (iso: string, timeZone: string): string => dayjs(iso).tz(timeZone).format("HH:mm");

export const activityBlockToTripPlanItem = (
  block: ActivityBlock,
  day: DayPlan,
  travelFromPrevious: number,
  timeZone: string,
  sortedIndex: number,
  travelEstimateConfidence?: TripPlanItem["travelEstimateConfidence"],
): TripPlanItem => {
  const n = block.normalizedTripPlanItem;
  const indoorOutdoor = block.indoorOutdoor;

  const priority: TripPlanPriority = n?.priority ?? mapPriority(block.priority);

  const status: TripPlanItem["status"] =
    n?.status ??
    (block.completionStatus === "done"
      ? "completed"
      : block.completionStatus === "skipped"
        ? "skipped"
        : "planned");

  const estimatedDurationMinutes = n?.estimatedDurationMinutes ?? durationFromTimes(block.startTime, block.endTime);

  let travelTimeFromPreviousMinutes = travelFromPrevious;
  if (n && n.travelTimeFromPreviousMinutes !== null && n.travelTimeFromPreviousMinutes !== undefined) {
    travelTimeFromPreviousMinutes = n.travelTimeFromPreviousMinutes;
  } else if (n && n.travelTimeFromPreviousMinutes === null) {
    travelTimeFromPreviousMinutes = sortedIndex === 0 ? 0 : travelFromPrevious;
  }

  const locationResolutionStatus = n?.locationResolutionStatus ?? (hasBlockLatLng(block) ? "resolved" : "missing");
  const lat = locationResolutionStatus === "missing" ? 0 : (block.place?.latitude ?? 0);
  const lng = locationResolutionStatus === "missing" ? 0 : (block.place?.longitude ?? 0);

  const item: TripPlanItem = {
    id: block.id,
    title: block.title,
    type: block.type,
    priority,
    location: {
      lat,
      lng,
      indoorOutdoor: indoorOutdoor === "mixed" ? undefined : indoorOutdoor,
    },
    plannedStartTime: wallIso(day.date, block.startTime, timeZone),
    plannedEndTime: wallIso(day.date, block.endTime, timeZone),
    estimatedDurationMinutes,
    travelTimeFromPreviousMinutes,
    status,
    locationResolutionStatus,
  };

  if (n?.imageUrl !== undefined && n.imageUrl.length > 0) {
    item.imageUrl = n.imageUrl;
  }

  const label = n?.openingHoursLabel ?? block.place?.openingHoursLabel;
  if (label !== undefined && label.trim().length > 0) {
    item.openingHoursLabel = label.trim();
    item.openingHoursTimezone = n?.openingHoursTimezone ?? timeZone;
  }

  if (travelEstimateConfidence !== undefined) {
    item.travelEstimateConfidence = travelEstimateConfidence;
  }

  const providerPlaceId = block.place?.providerPlaceId?.trim();
  if (providerPlaceId) {
    item.providerPlaceId = providerPlaceId;
  }
  const bucketListItemId = block.place?.bucketListItemId?.trim();
  if (bucketListItemId) {
    item.bucketListItemId = bucketListItemId;
  }

  return item;
};

export const dayPlanToTripPlanItems = (day: DayPlan, trip: Trip | null, legs: MovementLeg[] | undefined): TripPlanItem[] => {
  const tz = resolvePlanTimezone(trip, day.segmentId);
  const sorted = [...day.blocks].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
  );
  return sorted.map((block, index) => {
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const leg = previous ? legToBlock(legs ?? day.movementLegs, block.id) : undefined;
    const travel = index === 0 ? 0 : Math.max(0, leg?.primary.durationMinutes ?? 0);
    const confidence = index > 0 ? leg?.primary.estimateConfidence : undefined;
    return activityBlockToTripPlanItem(block, day, travel, tz, index, confidence);
  });
};

export const buildExecutionStateFromDay = (
  day: DayPlan,
  trip: Trip | null,
  options: {
    nowIso: string;
    completedIds: string[];
    skippedIds: string[];
    energyLevel?: TripExecutionEnergyLevel;
    weatherRisk?: TripExecutionState["weatherRisk"];
  },
): TripExecutionState => {
  const items = dayPlanToTripPlanItems(day, trip, day.movementLegs);
  const sortedBlocks = [...day.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayStart = sortedBlocks[0]?.startTime ?? "09:00";
  const dayEnd = sortedBlocks[sortedBlocks.length - 1]?.endTime ?? "20:00";

  return {
    now: options.nowIso,
    dayStartTime: dayStart.slice(0, 5),
    dayEndTime: dayEnd.slice(0, 5),
    items,
    completedItemIds: [...options.completedIds],
    skippedItemIds: [...options.skippedIds],
    userMode: mapExplorationToMode(trip?.executionProfile),
    energyLevel: options.energyLevel,
    weatherRisk: options.weatherRisk,
  };
};

export const completionIdsFromDay = (day: DayPlan): { completed: string[]; skipped: string[] } => {
  const completed: string[] = [];
  const skipped: string[] = [];
  for (const b of day.blocks) {
    if (b.completionStatus === "done") {
      completed.push(b.id);
    } else if (b.completionStatus === "skipped") {
      skipped.push(b.id);
    }
  }
  return { completed, skipped };
};

export const pickLiveDayId = (trip: Trip | null, days: DayPlan[], now: Date): DayPlan | null => {
  if (days.length === 0) {
    return null;
  }
  const withTz = (day: DayPlan) => ({ day, tz: resolvePlanTimezone(trip, day.segmentId) });
  const todayLabels = days.map(withTz).map(({ day, tz }) => ({
    day,
    label: dayjs(now).tz(tz).format("YYYY-MM-DD"),
  }));
  const match = todayLabels.find(({ day, label }) => day.date === label);
  if (match) {
    return match.day;
  }
  const inRange = days.find((d) => d.date >= (trip?.dateRange.start ?? "") && d.date <= (trip?.dateRange.end ?? ""));
  return inRange ?? days[0] ?? null;
};

export const mergeReplanIntoDayPlan = (day: DayPlan, result: ReplanResult, trip: Trip | null): DayPlan => {
  const tz = resolvePlanTimezone(trip, day.segmentId);
  const byId = new Map(result.updatedItems.map((item) => [item.id, item]));
  const ids = new Set(byId.keys());

  const nextBlocks = day.blocks
    .filter((b) => ids.has(b.id))
    .map((b) => {
      const u = byId.get(b.id)!;
      return {
        ...b,
        startTime: isoToWallHHmm(u.plannedStartTime, tz),
        endTime: isoToWallHHmm(u.plannedEndTime, tz),
      };
    });

  const order = [...result.updatedItems].sort((a, b) => a.plannedStartTime.localeCompare(b.plannedStartTime));
  const orderIndex = new Map(order.map((item, i) => [item.id, i]));
  nextBlocks.sort((a, b) => (orderIndex.get(a.id) ?? 1e9) - (orderIndex.get(b.id) ?? 1e9));

  return {
    ...day,
    blocks: nextBlocks,
    updatedAt: new Date().toISOString(),
  };
};
