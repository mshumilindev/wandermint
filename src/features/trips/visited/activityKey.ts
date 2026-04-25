import type { ActivityBlock } from "../../../entities/activity/model";

const hashString = (input: string): number => {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return hash >>> 0;
};

/**
 * Stable key for overlay + pacing. Prefer block.id; fallback deterministic from trip/day/index/title/time.
 */
export const stableActivityKey = (tripId: string, dayId: string, dayIndex: number, blockIndex: number, block: ActivityBlock): string => {
  const trimmedId = block.id?.trim();
  if (trimmedId) {
    return `${tripId}::${dayId}::${trimmedId}`;
  }

  const h = hashString(`${block.title}|${block.startTime}|${block.endTime}`).toString(36);
  return `${tripId}::${dayId}::d${dayIndex}_b${blockIndex}_${h}`;
};
