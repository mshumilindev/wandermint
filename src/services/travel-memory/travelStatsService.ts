import dayjs from "dayjs";
import type { TravelMemory, TravelStats } from "../../entities/travel-memory/model";

const inclusiveDays = (startDate: string, endDate: string): number => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid()) {
    return 0;
  }
  return Math.max(end.diff(start, "day") + 1, 1);
};

const increment = (record: Record<string, number>, key: string): Record<string, number> => ({
  ...record,
  [key]: (record[key] ?? 0) + 1,
});

const toRankedList = (record: Record<string, number>): Array<{ label: string; count: number }> =>
  Object.entries(record)
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

export const travelStatsService = {
  calculateStats: (memories: TravelMemory[]): TravelStats => {
    const countrySet = new Set(memories.map((memory) => memory.country.trim()).filter(Boolean));
    const citySet = new Set(memories.map((memory) => `${memory.city.trim()}, ${memory.country.trim()}`).filter((label) => label.length > 2));
    const placeCounts = memories.reduce<Record<string, number>>((counts, memory) => increment(counts, `${memory.city}, ${memory.country}`), {});
    const yearCounts = memories.reduce<Record<string, number>>((counts, memory) => increment(counts, dayjs(memory.startDate).format("YYYY")), {});
    const styleCounts = memories.reduce<Record<string, number>>((counts, memory) => increment(counts, memory.style), {});
    const repeatVisits = toRankedList(placeCounts).filter((place) => place.count > 1).reduce((count, place) => count + place.count - 1, 0);

    return {
      visitedCountries: countrySet.size,
      visitedCities: citySet.size,
      tripsRecorded: memories.length,
      travelDays: memories.reduce((total, memory) => total + inclusiveDays(memory.startDate, memory.endDate), 0),
      repeatVisits,
      mostVisited: toRankedList(placeCounts).slice(0, 5),
      yearlyActivity: toRankedList(yearCounts).sort((left, right) => left.label.localeCompare(right.label)),
      styleDistribution: Object.entries(styleCounts).map(([style, count]) => ({ style: style as TravelMemory["style"], count })),
    };
  },
};
