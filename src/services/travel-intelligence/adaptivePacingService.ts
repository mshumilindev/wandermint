import type { TravelExecutionProfile } from "../../entities/trip/model";

export const adaptivePacingService = {
  densityMultiplier: (profile: TravelExecutionProfile): number => {
    if (profile.scheduleDensity === "extreme" || profile.explorationSpeed === "very_fast") {
      return 1.35;
    }
    if (profile.scheduleDensity === "dense" || profile.explorationSpeed === "fast") {
      return 1.18;
    }
    if (profile.scheduleDensity === "relaxed" || profile.explorationSpeed === "slow") {
      return 0.82;
    }
    return 1;
  },

  feasibilityLabel: (activeMinutes: number, profile: TravelExecutionProfile): "comfortable" | "dense" | "aggressive" | "brittle" => {
    const multiplier = adaptivePacingService.densityMultiplier(profile);
    const adjustedMinutes = activeMinutes / multiplier;
    if (adjustedMinutes > 720) {
      return "brittle";
    }
    if (adjustedMinutes > 600) {
      return "aggressive";
    }
    if (adjustedMinutes > 480) {
      return "dense";
    }
    return "comfortable";
  },
};
