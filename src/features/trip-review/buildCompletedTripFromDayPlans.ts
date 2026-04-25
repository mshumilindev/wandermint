import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import type { TripPlanItem } from "../trip-execution/decisionEngine.types";
import { dayPlanToTripPlanItems } from "../trips/execution/buildLiveExecutionModel";
import type { CompletedTrip } from "./tripReview.types";

const isCountableBlock = (block: ActivityBlock): boolean => block.completionStatus !== "cancelled_by_replan";

/** Strips coordinates from plan items before persisting post-trip analysis (requirement 7). */
const stripLocationForStoredReview = (item: TripPlanItem): TripPlanItem => ({
  ...item,
  location: {
    lat: 0,
    lng: 0,
    ...(item.location.indoorOutdoor ? { indoorOutdoor: item.location.indoorOutdoor } : {}),
  },
});

/**
 * Builds a {@link CompletedTrip} from saved day plans for post-trip review.
 * Planned items omit raw lat/lng — only structural fields used by {@link ./tripReviewSummary.buildTripReview}.
 */
export const buildCompletedTripForTripReviewFromDayPlans = (days: DayPlan[], trip: Trip): CompletedTrip | null => {
  const countableIds = new Set(days.flatMap((d) => d.blocks).filter(isCountableBlock).map((b) => b.id));
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const plannedItems = sortedDays
    .flatMap((day) => dayPlanToTripPlanItems(day, trip, day.movementLegs).map(stripLocationForStoredReview))
    .filter((item) => countableIds.has(item.id));

  if (plannedItems.length === 0) {
    return null;
  }

  plannedItems.sort((a, b) => a.plannedStartTime.localeCompare(b.plannedStartTime));

  const completedItemIds: string[] = [];
  const skippedItemIds: string[] = [];
  for (const day of days) {
    for (const b of day.blocks) {
      if (!isCountableBlock(b)) {
        continue;
      }
      if (b.completionStatus === "done" || b.completionStatus === "unconfirmed") {
        completedItemIds.push(b.id);
      } else if (b.completionStatus === "skipped" || b.completionStatus === "missed") {
        skippedItemIds.push(b.id);
      }
    }
  }

  return {
    tripId: trip.id,
    userId: trip.userId,
    plannedItems,
    completedItemIds,
    skippedItemIds,
  };
};
