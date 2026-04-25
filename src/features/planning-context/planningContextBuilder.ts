import dayjs from "dayjs";
import { publicGeoProvider } from "../../services/providers/publicGeoProvider";
import { fetchDailyWeather, fetchDaylight, fetchRightNowWeather } from "./planningContextOpenData";
import type { BaseLocation, LocationContext, OpenNowHints, PlanDay, PlanningContextWidgetModel, TimeWindow } from "./planningContext.types";

const toBudget = (amount?: number): "low" | "medium" | "high" => {
  if (!amount || amount <= 0) {
    return "medium";
  }
  if (amount < 900) {
    return "low";
  }
  if (amount > 2800) {
    return "high";
  }
  return "medium";
};

const deriveOpenNowHints = (hour: number, condition?: string): OpenNowHints => {
  const suggested =
    hour < 11
      ? ["cafes", "museums", "parks"]
      : hour < 17
        ? ["attractions", "restaurants"]
        : hour < 22
          ? ["restaurants", "bars", "viewpoints"]
          : ["nightlife"];
  const restricted: string[] = [];
  if (condition === "rain") {
    suggested.push("indoor");
    restricted.push("parks", "viewpoints");
  }
  if (condition === "storm") {
    restricted.push("outdoor_long_walks", "viewpoints");
    if (!suggested.includes("indoor")) {
      suggested.push("indoor");
    }
  }
  return {
    suggestedCategories: [...new Set(suggested)],
    restrictedCategories: [...new Set(restricted)],
  };
};

const buildTimeWindow = (flow: "right_now" | "create_plan", input: { startDate?: string; endDate?: string }): TimeWindow => {
  if (flow === "right_now") {
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    return { isNow: true, totalDays: 1, days: [{ date: dayjs(start).format("YYYY-MM-DD"), start, end }] };
  }
  const start = input.startDate ? dayjs(input.startDate) : dayjs();
  const end = input.endDate ? dayjs(input.endDate) : start;
  const days: PlanDay[] = [];
  let cursor = start.startOf("day");
  const cap = end.startOf("day");
  while (cursor.isBefore(cap) || cursor.isSame(cap, "day")) {
    days.push({ date: cursor.format("YYYY-MM-DD") });
    cursor = cursor.add(1, "day");
    if (days.length >= 14) {
      break;
    }
  }
  return { isNow: false, days, totalDays: days.length };
};

const resolveCoordinatesIfPossible = async (location: BaseLocation): Promise<BaseLocation> => {
  if (location.coordinates) {
    return location;
  }
  if (!location.label && !location.city) {
    return location;
  }
  try {
    const query = location.label ?? [location.city, location.country].filter(Boolean).join(", ");
    const point = await publicGeoProvider.geocode(query);
    return {
      ...location,
      coordinates: { lat: point.latitude, lng: point.longitude },
      city: location.city ?? point.label.split(",")[0]?.trim(),
      country: location.country ?? point.label.split(",")[1]?.trim(),
      label: location.label ?? point.label,
    };
  } catch {
    return location;
  }
};

export const buildPlanningContextWidgets = async (input: {
  flow: "right_now" | "create_plan";
  locations: BaseLocation[];
  startDate?: string;
  endDate?: string;
  budgetAmount?: number;
}): Promise<PlanningContextWidgetModel> => {
  const timeWindow = buildTimeWindow(input.flow, { startDate: input.startDate, endDate: input.endDate });
  const hydratedLocations = await Promise.all(input.locations.map((loc) => resolveCoordinatesIfPossible(loc)));

  const locationContexts: LocationContext[] = await Promise.all(
    hydratedLocations.map(async (location) => {
      if (!location.coordinates) {
        return { location, isPartial: true };
      }
      try {
        if (input.flow === "right_now") {
          const [weather, daylight] = await Promise.all([
            fetchRightNowWeather(location.coordinates.lat, location.coordinates.lng),
            fetchDaylight(location.coordinates.lat, location.coordinates.lng),
          ]);
          return { location, weather, daylight };
        }
        const [daily, daylight] = await Promise.all([
          fetchDailyWeather(location.coordinates.lat, location.coordinates.lng),
          fetchDaylight(location.coordinates.lat, location.coordinates.lng),
        ]);
        return { location, weather: { daily }, daylight };
      } catch {
        return { location, isPartial: true };
      }
    }),
  );

  const totalLocations = locationContexts.length;
  const mobilityMode =
    totalLocations <= 1 && timeWindow.totalDays <= 1
      ? "walk"
      : totalLocations <= 2 && timeWindow.totalDays <= 2
        ? "mixed"
        : "transport";
  const firstCondition = locationContexts[0]?.weather?.current?.condition ?? locationContexts[0]?.weather?.daily?.[0]?.condition;
  return {
    flow: input.flow,
    locations: locationContexts,
    timeWindow,
    mobility: { mode: mobilityMode },
    openNowHints: deriveOpenNowHints(new Date().getHours(), firstCondition),
    budget: toBudget(input.budgetAmount),
  };
};
