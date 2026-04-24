import type { DayPlan } from "../../../entities/day-plan/model";
import type { Trip } from "../../../entities/trip/model";
import type { PlanWarning } from "../../../entities/warning/model";
import { createClientId } from "../../../shared/lib/id";
import { nowIso } from "../../../services/firebase/timestampMapper";
import { publicWeatherProvider } from "../../../services/providers/publicWeatherProvider";

export const tripRevalidationService = {
  revalidateTrip: async (trip: Trip, days: DayPlan[]): Promise<PlanWarning[]> => {
    const forecast = await publicWeatherProvider.getForecast(trip.destination, trip.dateRange);
    const rainy = forecast.some((item) => item.precipitationChance >= 30);
    const outdoorBlocks = days.flatMap((day) => day.blocks.filter((block) => block.dependencies.weatherSensitive));

    if (!rainy || outdoorBlocks.length === 0) {
      return [];
    }

    return [
      {
        id: createClientId("warning"),
        userId: trip.userId,
        tripId: trip.id,
        severity: "warning",
        type: "weather_change",
        message: "Weather has drifted toward a wetter pattern for at least one planned outdoor-sensitive block.",
        affectedBlockIds: outdoorBlocks.slice(0, 4).map((block) => block.id),
        suggestedAction: "Review indoor alternatives or ask the planning console to replace outdoor blocks.",
        createdAt: nowIso(),
      },
    ];
  },
};
