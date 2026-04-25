import dayjs from "dayjs";
import { fetchDailyWeather } from "../../planning-context/planningContextOpenData";

export type ScoredDateWindow = {
  startDate: string;
  endDate: string;
  score: number;
  reasonParts: string[];
};

const addDays = (iso: string, delta: number): string => dayjs(iso).add(delta, "day").format("YYYY-MM-DD");

const weekendDaysInRange = (start: string, end: string): number => {
  let count = 0;
  let cursor = dayjs(start);
  const last = dayjs(end);
  while (cursor.isBefore(last) || cursor.isSame(last, "day")) {
    const d = cursor.day();
    if (d === 0 || d === 6) {
      count += 1;
    }
    cursor = cursor.add(1, "day");
  }
  return count;
};

/**
 * Scores candidate start dates in the next `horizonDays` for a fixed trip duration.
 * Uses Open-Meteo for the first ~16 days when coordinates exist; later dates lean on seasonality + weekends.
 */
export const scoreDestinationDateWindows = async (params: {
  durationDays: number;
  horizonDays: number;
  seasonalMonths?: number[];
  latitude?: number;
  longitude?: number;
}): Promise<ScoredDateWindow[]> => {
  const duration = Math.max(1, params.durationDays);
  const horizon = Math.min(60, Math.max(14, params.horizonDays));
  const today = dayjs().startOf("day");
  const candidates: ScoredDateWindow[] = [];

  let meteo: Awaited<ReturnType<typeof fetchDailyWeather>> | null = null;
  if (params.latitude !== undefined && params.longitude !== undefined) {
    try {
      meteo = await fetchDailyWeather(params.latitude, params.longitude);
    } catch {
      meteo = null;
    }
  }

  const monthBoost = (iso: string): number => {
    if (!params.seasonalMonths?.length) {
      return 0.55;
    }
    const m = dayjs(iso).month() + 1;
    return params.seasonalMonths.includes(m) ? 0.95 : 0.45;
  };

  const weatherForStart = (start: string): number => {
    if (!meteo?.length) {
      return 0.55;
    }
    const row = meteo.find((d) => d.date === start) ?? meteo[0];
    if (!row) {
      return 0.55;
    }
    const bad = row.condition === "storm" || row.condition === "snow" ? 0.35 : row.condition === "rain" ? 0.55 : 0.82;
    return bad;
  };

  for (let offset = 3; offset <= horizon; offset += params.durationDays > 5 ? 5 : 4) {
    const start = today.add(offset, "day").format("YYYY-MM-DD");
    const end = addDays(start, duration - 1);
    const wEnd = dayjs(end);
    if (wEnd.diff(today, "day") > horizon) {
      break;
    }
    const wknd = weekendDaysInRange(start, end);
    const wkndScore = Math.min(1, 0.45 + (wknd / Math.max(1, duration)) * 0.45);
    const season = monthBoost(start);
    const wx = weatherForStart(start);
    const score = wx * 0.42 + wkndScore * 0.28 + season * 0.3;
    const reasonParts: string[] = [];
    if (wknd >= 2) {
      reasonParts.push("includes weekend days");
    }
    if (params.seasonalMonths?.includes(dayjs(start).month() + 1)) {
      reasonParts.push("matches seasonal window for this destination");
    }
    if (meteo) {
      reasonParts.push(`weather outlook near start (${wx >= 0.7 ? "favorable" : "mixed"})`);
    }
    candidates.push({ startDate: start, endDate: end, score, reasonParts });
  }

  const extraWeekend = today.day() <= 3 ? today.add(5 - today.day(), "day").format("YYYY-MM-DD") : today.add(6, "day").format("YYYY-MM-DD");
  if (!candidates.some((c) => c.startDate === extraWeekend)) {
    const end = addDays(extraWeekend, duration - 1);
    const wknd = weekendDaysInRange(extraWeekend, end);
    const wkndScore = Math.min(1, 0.45 + (wknd / Math.max(1, duration)) * 0.45);
    const season = monthBoost(extraWeekend);
    const wx = weatherForStart(extraWeekend);
    const score = wx * 0.42 + wkndScore * 0.28 + season * 0.3;
    candidates.push({
      startDate: extraWeekend,
      endDate: end,
      score,
      reasonParts: ["biased toward upcoming weekend", ...monthBoost(extraWeekend) > 0.7 ? ["seasonal fit"] : []],
    });
  }

  if (candidates.length === 0) {
    const start = today.add(10, "day").format("YYYY-MM-DD");
    const end = addDays(start, duration - 1);
    candidates.push({
      startDate: start,
      endDate: end,
      score: 0.5,
      reasonParts: ["default window within the next two months"],
    });
  }

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return sorted.slice(0, 12);
};

export const pickTopWindows = (
  windows: ScoredDateWindow[],
): { balanced: ScoredDateWindow; cheapest: ScoredDateWindow; comfort: ScoredDateWindow } => {
  const sorted = [...windows].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) {
    const today = dayjs().startOf("day");
    const start = today.add(10, "day").format("YYYY-MM-DD");
    const end = today.add(13, "day").format("YYYY-MM-DD");
    const stub: ScoredDateWindow = { startDate: start, endDate: end, score: 0.4, reasonParts: ["fallback"] };
    return { balanced: stub, cheapest: stub, comfort: stub };
  }
  const balanced = sorted[0]!;
  const cheapest = sorted[sorted.length - 1]!;
  const comfort = sorted.length > 2 ? sorted[Math.min(2, sorted.length - 1)]! : sorted[0]!;
  return { balanced, cheapest, comfort };
};
