import dayjs from "dayjs";
import type { ActivityBlock } from "../../entities/activity/model";
import type { DayPlan } from "../../entities/day-plan/model";
import type { ReplanAction, ReplanProposal } from "../../entities/replan/model";
import type { PlanWarning } from "../../entities/warning/model";
import { ANALYTICS_EVENTS } from "../../features/observability/analyticsEvents";
import { logAnalyticsEvent } from "../../features/observability/appLogger";
import { movementPlanningService } from "../planning/movementPlanningService";

interface ExecuteReplanProposalInput {
  proposal: ReplanProposal;
  days: DayPlan[];
}

export interface ReplanExecutionResult {
  days: DayPlan[];
  warnings: string[];
  appliedActionIds: string[];
  skippedActionIds: string[];
  summary: string;
}

const nowIso = (): string => new Date().toISOString();

const parseMinutes = (value: string): number => {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

const formatMinutes = (value: number): string => {
  const safe = Math.max(0, Math.round(value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const blockDuration = (block: ActivityBlock): number =>
  Math.max(15, parseMinutes(block.endTime) - parseMinutes(block.startTime));

const sortBlocks = (blocks: ActivityBlock[]): ActivityBlock[] =>
  [...blocks].sort((left, right) => parseMinutes(left.startTime) - parseMinutes(right.startTime));

const hasOverlap = (blocks: ActivityBlock[]): boolean => {
  const ordered = sortBlocks(blocks);
  return ordered.some((block, index) => {
    const nextBlock = ordered[index + 1];
    return nextBlock ? parseMinutes(block.endTime) > parseMinutes(nextBlock.startTime) : false;
  });
};

const findDayContainingBlock = (days: DayPlan[], action: ReplanAction): DayPlan | undefined => {
  if (action.fromDayId) {
    return days.find((day) => day.id === action.fromDayId);
  }

  return days.find((day) => day.blocks.some((block) => block.id === action.blockId));
};

const rebuildDay = async (day: DayPlan): Promise<DayPlan> => {
  const sortedBlocks = sortBlocks(day.blocks);
  return {
    ...day,
    blocks: sortedBlocks,
    movementLegs: await movementPlanningService.buildMovementLegs(sortedBlocks),
    updatedAt: nowIso(),
  };
};

const createWarning = (day: DayPlan, message: string, affectedBlockIds: string[]): PlanWarning => ({
  id: `warning-${Math.random().toString(36).slice(2, 10)}`,
  userId: day.userId,
  tripId: day.tripId,
  severity: "warning",
  type: "route_issue",
  message,
  affectedBlockIds,
  suggestedAction: "Review the timeline before saving this replan.",
  createdAt: nowIso(),
});

const replaceBlock = (block: ActivityBlock, action: ReplanAction): ActivityBlock => ({
  ...block,
  title: action.replacementTitle ?? block.title,
  description: action.replacementDescription ?? action.rationale ?? block.description,
  place: action.replacementPlace ?? block.place,
  estimatedCost: action.replacementEstimatedCost ?? block.estimatedCost,
  sourceSnapshots:
    action.replacementSourceSnapshots && action.replacementSourceSnapshots.length > 0
      ? action.replacementSourceSnapshots
      : block.sourceSnapshots,
  alternatives:
    action.replacementAlternatives && action.replacementAlternatives.length > 0
      ? action.replacementAlternatives
      : block.alternatives,
});

const findValidSlot = (
  targetDay: DayPlan,
  movingBlock: ActivityBlock,
  explicitStartTime?: string,
  explicitEndTime?: string,
): { startTime: string; endTime: string } | null => {
  const duration = blockDuration(movingBlock);
  const ordered = sortBlocks(targetDay.blocks);

  if (explicitStartTime && explicitEndTime) {
    const startMinutes = parseMinutes(explicitStartTime);
    const endMinutes = parseMinutes(explicitEndTime);
    const candidate = {
      ...movingBlock,
      startTime: explicitStartTime,
      endTime: explicitEndTime,
    };
    if (endMinutes > startMinutes && !hasOverlap([...ordered, candidate])) {
      return { startTime: explicitStartTime, endTime: explicitEndTime };
    }
  }

  const dayStart = 8 * 60;
  const dayEnd = 22 * 60;
  let cursor = dayStart;

  for (const block of ordered) {
    const nextStart = parseMinutes(block.startTime);
    if (nextStart - cursor >= duration) {
      const candidate = {
        ...movingBlock,
        startTime: formatMinutes(cursor),
        endTime: formatMinutes(cursor + duration),
      };
      if (!hasOverlap([...ordered, candidate])) {
        return { startTime: candidate.startTime, endTime: candidate.endTime };
      }
    }
    cursor = Math.max(cursor, parseMinutes(block.endTime));
  }

  if (dayEnd - cursor >= duration) {
    return {
      startTime: formatMinutes(cursor),
      endTime: formatMinutes(cursor + duration),
    };
  }

  return null;
};

const compressDay = (day: DayPlan): { day: DayPlan; changed: boolean } => {
  const ordered = sortBlocks(day.blocks);
  let changed = false;
  const updatedBlocks = ordered.map((block) => {
    if (block.locked || block.priority === "must") {
      return block;
    }

    const duration = blockDuration(block);
    const minimumDuration = block.type === "rest" ? 20 : 30;
    if (duration <= minimumDuration) {
      return block;
    }

    const reduction = Math.min(20, duration - minimumDuration);
    if (reduction <= 0) {
      return block;
    }

    changed = true;
    return {
      ...block,
      endTime: formatMinutes(parseMinutes(block.endTime) - reduction),
    };
  });

  return {
    day: {
      ...day,
      blocks: updatedBlocks,
      warnings: changed
        ? [
            ...day.warnings,
            createWarning(day, "The day has been tightened by trimming flexible stops first.", []),
          ]
        : day.warnings,
    },
    changed,
  };
};

export const executeReplanProposal = async ({
  proposal,
  days,
}: ExecuteReplanProposalInput): Promise<ReplanExecutionResult> => {
  const actionTypes: Record<string, number> = {};
  for (const action of proposal.actions) {
    actionTypes[action.type] = (actionTypes[action.type] ?? 0) + 1;
  }
  const dayIdSet = new Set<string>();
  for (const action of proposal.actions) {
    if (action.fromDayId) {
      dayIdSet.add(action.fromDayId);
    }
    if (action.toDayId) {
      dayIdSet.add(action.toDayId);
    }
  }
  logAnalyticsEvent(ANALYTICS_EVENTS.replan_triggered, {
    tripId: proposal.tripId,
    actionCount: proposal.actions.length,
    reason: proposal.reason,
    actionTypes,
    uniqueDayIds: dayIdSet.size,
  });

  const workingDays = new Map(days.map((day) => [day.id, { ...day, blocks: [...day.blocks], warnings: [...day.warnings] }]));
  const warnings: string[] = [];
  const appliedActionIds: string[] = [];
  const skippedActionIds: string[] = [];
  const changedDayIds = new Set<string>();

  for (const action of proposal.actions) {
    if (action.type === "remove_activity" && action.blockId) {
      const sourceDay = findDayContainingBlock(Array.from(workingDays.values()), action);
      if (!sourceDay) {
        skippedActionIds.push(action.id);
        warnings.push(`Couldn't find the step for "${action.rationale}".`);
        continue;
      }

      workingDays.set(sourceDay.id, {
        ...sourceDay,
        blocks: sourceDay.blocks
          .map((block) =>
            block.id === action.blockId
              ? {
                  ...block,
                  completionStatus: "cancelled_by_replan" as const,
                }
              : block,
          )
          .filter((block) => (block.id === action.blockId ? !action.deleteOriginal : true)),
      });
      changedDayIds.add(sourceDay.id);
      appliedActionIds.push(action.id);
      continue;
    }

    if (action.type === "replace_activity" && action.blockId) {
      const sourceDay = findDayContainingBlock(Array.from(workingDays.values()), action);
      if (!sourceDay) {
        skippedActionIds.push(action.id);
        warnings.push(`Couldn't find the step to replace for "${action.rationale}".`);
        continue;
      }

      workingDays.set(sourceDay.id, {
        ...sourceDay,
        blocks: sourceDay.blocks.map((block) => (block.id === action.blockId ? replaceBlock(block, action) : block)),
      });
      changedDayIds.add(sourceDay.id);
      appliedActionIds.push(action.id);
      continue;
    }

    if (action.type === "move_activity" && action.blockId && action.toDayId) {
      const sourceDay = findDayContainingBlock(Array.from(workingDays.values()), action);
      const targetDay = workingDays.get(action.toDayId);
      const movingBlock = sourceDay?.blocks.find((block) => block.id === action.blockId);
      if (!sourceDay || !targetDay || !movingBlock) {
        skippedActionIds.push(action.id);
        warnings.push(`Couldn't move one of the planned steps because its source or target day is missing.`);
        continue;
      }

      const slot = findValidSlot(targetDay, movingBlock, action.targetStartTime, action.targetEndTime);
      if (!slot) {
        skippedActionIds.push(action.id);
        warnings.push(`"${movingBlock.title}" could not fit into a realistic slot on the target day.`);
        continue;
      }

      workingDays.set(sourceDay.id, {
        ...sourceDay,
        blocks: sourceDay.blocks.filter((block) => block.id !== movingBlock.id),
      });
      workingDays.set(targetDay.id, {
        ...targetDay,
        blocks: [
          ...targetDay.blocks,
          {
            ...movingBlock,
            startTime: slot.startTime,
            endTime: slot.endTime,
            completionStatus: "pending" as const,
          },
        ],
      });
      changedDayIds.add(sourceDay.id);
      changedDayIds.add(targetDay.id);
      appliedActionIds.push(action.id);
      continue;
    }

    if (action.type === "compress_day") {
      const targetDayId = action.toDayId ?? action.fromDayId ?? proposal.sourceDayId;
      const targetDay = targetDayId ? workingDays.get(targetDayId) : undefined;
      if (!targetDay) {
        skippedActionIds.push(action.id);
        warnings.push("WanderMint couldn't find the day that needed tightening.");
        continue;
      }

      const compressed = compressDay(targetDay);
      if (!compressed.changed) {
        skippedActionIds.push(action.id);
        warnings.push(`"${targetDay.theme}" had no flexible blocks left to compress.`);
        continue;
      }

      workingDays.set(targetDay.id, compressed.day);
      changedDayIds.add(targetDay.id);
      appliedActionIds.push(action.id);
      continue;
    }

    skippedActionIds.push(action.id);
  }

  const finalDays = await Promise.all(
    Array.from(workingDays.values()).map(async (day) => {
      if (!changedDayIds.has(day.id)) {
        return day;
      }

      const rebuilt = await rebuildDay(day);
      if (hasOverlap(rebuilt.blocks)) {
        rebuilt.warnings = [
          ...rebuilt.warnings,
          createWarning(rebuilt, "This replan still leaves a tight overlap in the timeline.", rebuilt.blocks.map((block) => block.id)),
        ];
      }
      return rebuilt;
    }),
  );

  return {
    days: finalDays,
    warnings,
    appliedActionIds,
    skippedActionIds,
    summary:
      appliedActionIds.length > 0
        ? `Applied ${appliedActionIds.length} change${appliedActionIds.length === 1 ? "" : "s"}${warnings.length > 0 ? `, with ${warnings.length} note${warnings.length === 1 ? "" : "s"} to review.` : "."}`
        : "No changes were safely applied.",
  };
};
