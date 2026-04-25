import type { ActivityBlock, MovementLeg } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { Trip } from "../../entities/trip/model";
import type { TripShare } from "./share.types";

const blankCost = (): ActivityBlock["estimatedCost"] => ({
  min: 0,
  max: 0,
  currency: "USD",
  certainty: "unknown",
});

const stripBlockForShare = (block: ActivityBlock, share: TripShare): ActivityBlock => {
  let next: ActivityBlock = {
    ...block,
    /** Narrative “reason” lines are often model-generated; never expose on shared links. */
    alternatives: [],
  };
  if (!share.includeLiveStatus) {
    next = { ...next, completionStatus: "pending" };
  }
  if (!share.includeDocuments) {
    next = { ...next, description: "" };
  }
  if (!share.includeCosts) {
    next = { ...next, estimatedCost: blankCost() };
  }
  return next;
};

const stripMovementLegsForShare = (legs: MovementLeg[] | undefined): MovementLeg[] | undefined => {
  if (!legs?.length) {
    return legs;
  }
  return legs.map((leg) => ({
    ...leg,
    summary: "",
    alternatives: [],
  }));
};

const stripDayForShare = (day: DayPlan, share: TripShare): DayPlan => {
  let next: DayPlan = {
    ...day,
    blocks: day.blocks.map((b) => stripBlockForShare(b, share)),
    movementLegs: stripMovementLegsForShare(day.movementLegs),
    /** Warning copy may include internal validation / model phrasing; omit on shared views. */
    warnings: [],
  };
  if (!share.includeLiveStatus) {
    next = { ...next, completionStatus: "pending" };
  }
  if (!share.includeDocuments) {
    next = { ...next, adjustment: undefined };
  }
  if (!share.includeCosts) {
    next = {
      ...next,
      estimatedCostRange: blankCost(),
    };
  }
  return next;
};

const stripTravelSupportNarratives = (trip: Trip): Trip => {
  const ts = trip.travelSupport;
  if (!ts) {
    return trip;
  }
  return {
    ...trip,
    travelSupport: {
      ...ts,
      jetLag: { ...ts.jetLag, guidance: [] },
      clothingReminders: [],
      railPassConsideration: undefined,
    },
  };
};

/** Trip fields safe for shared viewers; preferences may still hold notes — use {@link redactTripForShare}. */
export const redactTripForShare = (trip: Trip, share: TripShare): Trip => {
  let next: Trip = stripTravelSupportNarratives({ ...trip });
  if (!share.includeDocuments) {
    next = {
      ...next,
      preferences: {
        ...next.preferences,
        mustSeeNotes: "",
        specialWishes: "",
      },
      flightInfo: {
        ...next.flightInfo,
        notes: undefined,
      },
    };
  }
  if (!share.includeCosts) {
    next = {
      ...next,
      budget: {
        ...next.budget,
        amount: 0,
        dailySoftLimit: undefined,
        hardCap: undefined,
        transportBudget: undefined,
        stayBudget: undefined,
        eventBudget: undefined,
        foodBudget: undefined,
        contingencyBuffer: undefined,
      },
      intercityMoves: (next.intercityMoves ?? []).map((m) => ({
        ...m,
        transportCandidates: m.transportCandidates.map((c) => ({ ...c, estimatedCost: undefined })),
      })),
    };
  }
  return next;
};

export const sanitizeDayPlansForShare = (days: readonly DayPlan[], share: TripShare): DayPlan[] =>
  [...days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => stripDayForShare(d, share));
