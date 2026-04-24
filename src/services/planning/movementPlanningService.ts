import type { ActivityBlock, MovementLeg } from "../../entities/activity/model";
import { publicRoutingProvider } from "../providers/publicRoutingProvider";

const fallbackLeg = (from: ActivityBlock, to: ActivityBlock): MovementLeg => ({
  id: `move-${from.id}-${to.id}`,
  fromBlockId: from.id,
  toBlockId: to.id,
  summary: "A short move between nearby stops",
  primary: {
    mode: "walking",
    durationMinutes: 10,
    certainty: "partial",
    sourceName: "Fallback estimate",
  },
  alternatives: [],
});

export const movementPlanningService = {
  buildMovementLegs: async (blocks: ActivityBlock[]): Promise<MovementLeg[]> => {
    const pairs: Array<readonly [ActivityBlock, ActivityBlock]> = [];
    for (let index = 0; index < blocks.length - 1; index += 1) {
      const from = blocks[index];
      const to = blocks[index + 1];
      if (from && to) {
        pairs.push([from, to]);
      }
    }

    const legs = await Promise.all(
      pairs.map(async ([from, to]) => {
        if (!from.place || !to.place) {
          return fallbackLeg(from, to);
        }

        try {
          const estimated = await publicRoutingProvider.estimateMovement(from.place, to.place);
          return {
            ...estimated,
            id: `move-${from.id}-${to.id}`,
            fromBlockId: from.id,
            toBlockId: to.id,
          };
        } catch {
          return fallbackLeg(from, to);
        }
      }),
    );

    return legs;
  },
};
