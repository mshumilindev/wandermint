import type { ActivityBlock, MovementLeg, PlaceSnapshot } from "../../entities/activity/model";
import { DEFAULT_INTER_BLOCK_TRAVEL_MINUTES, resolveTransportTime } from "../../features/transport/transportTimeResolver";
import { publicRoutingProvider } from "../providers/publicRoutingProvider";

const pointFromPlace = (place: PlaceSnapshot): { lat: number; lng: number } => ({
  lat: place.latitude as number,
  lng: place.longitude as number,
});

const legFromWalkingResult = (
  from: ActivityBlock,
  to: ActivityBlock,
  durationMinutes: number,
  sourceName: string,
  confidence: "high" | "medium" | "low",
): MovementLeg => ({
  id: `move-${from.id}-${to.id}`,
  fromBlockId: from.id,
  toBlockId: to.id,
  summary: "A short move between nearby stops",
  primary: {
    mode: "walking",
    durationMinutes,
    certainty: confidence === "high" ? "live" : "partial",
    sourceName,
    estimateConfidence: confidence,
  },
  alternatives: [],
});

const fallbackLeg = async (from: ActivityBlock, to: ActivityBlock): Promise<MovementLeg> => {
  if (from.place && to.place && from.place.latitude !== undefined && from.place.longitude !== undefined && to.place.latitude !== undefined && to.place.longitude !== undefined) {
    const r = await resolveTransportTime({
      from: pointFromPlace(from.place),
      to: pointFromPlace(to.place),
      mode: "walking",
    });
    return legFromWalkingResult(
      from,
      to,
      r.durationMinutes,
      r.source === "estimated" ? "Route estimate" : "Routed move",
      r.confidence,
    );
  }
  return legFromWalkingResult(from, to, DEFAULT_INTER_BLOCK_TRAVEL_MINUTES, "Default segment gap", "low");
};

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
