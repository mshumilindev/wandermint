import type { DayPlan } from "../../../entities/day-plan/model";
import type { ReplanProposal } from "../../../entities/replan/model";
import { createClientId } from "../../../shared/lib/id";
import { nowIso } from "../../../services/firebase/timestampMapper";

export const completionRecoveryService = {
  createUnfinishedDayProposal: (day: DayPlan): ReplanProposal | null => {
    const unfinished = day.blocks.filter((block) => !["done", "skipped", "cancelled_by_replan"].includes(block.completionStatus));
    if (unfinished.length === 0) {
      return null;
    }

    return {
      id: createClientId("proposal"),
      userId: day.userId,
      tripId: day.tripId,
      sourceDayId: day.id,
      createdAt: nowIso(),
      reason: "unfinished_day",
      summary: "Some planned blocks were not confirmed. Important items can be moved, low-priority items can be removed, and remaining days can be rebuilt.",
      actions: unfinished.map((block) => ({
        id: createClientId("action"),
        type: block.priority === "optional" ? "remove_activity" : "move_activity",
        blockId: block.id,
        fromDayId: day.id,
        rationale: block.priority === "optional" ? "Optional block can be dropped without damaging the core trip arc." : "Priority block should be preserved in a later day.",
      })),
    };
  },
};
