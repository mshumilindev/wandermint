import { z } from "zod";
import type { DailyWeather, DaylightData } from "./planningContext.types";

const TTL_MS = 12 * 60 * 1000;
const weatherCache = new Map<string, { expiresAt: number; value: DailyWeather[] }>();
const rightNowWeatherCache = new Map<string, { expiresAt: number; value: { current: { temperature: number; condition: string }; hourly: Array<{ time: string; temperature: number; condition: string }> } }>();
const daylightCache = new Map<string, { expiresAt: number; value: DaylightData }>();

const openMeteoDailySchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_min: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    weathercode: z.array(z.number()),
  }),
});

const openMeteoRightNowSchema = z.object({
  current_weather: z.object({
    temperature: z.number(),
    weathercode: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    weathercode: z.array(z.number()),
  }),
});

const sunriseSchema = z.object({
  status: z.literal("OK"),
  results: z.object({
    sunrise: z.string(),
    sunset: z.string(),
  }),
});

const weatherCodeLabel = (code: number): string => {
  if (code === 0) return "clear";
  if (code >= 1 && code <= 3) return "cloudy";
  if (code >= 45 && code <= 48) return "fog";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 95 && code <= 99) return "storm";
  return "cloudy";
};

const roundedKey = (lat: number, lng: number): string => `${lat.toFixed(2)}:${lng.toFixed(2)}`;

export const fetchDailyWeather = async (lat: number, lng: number): Promise<DailyWeather[]> => {
  const key = roundedKey(lat, lng);
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Daily weather unavailable.");
  }
  const parsed = openMeteoDailySchema.parse(await response.json());
  const mapped: DailyWeather[] = parsed.daily.time.map((date, index) => ({
    date,
    min: parsed.daily.temperature_2m_min[index] ?? 0,
    max: parsed.daily.temperature_2m_max[index] ?? 0,
    condition: weatherCodeLabel(parsed.daily.weathercode[index] ?? 1),
  }));
  weatherCache.set(key, { value: mapped, expiresAt: Date.now() + TTL_MS });
  return mapped;
};

export const fetchRightNowWeather = async (
  lat: number,
  lng: number,
): Promise<{ current: { temperature: number; condition: string }; hourly: Array<{ time: string; temperature: number; condition: string }> }> => {
  const key = roundedKey(lat, lng);
  const cached = rightNowWeatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("hourly", "temperature_2m,weathercode");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Current weather unavailable.");
  }
  const parsed = openMeteoRightNowSchema.parse(await response.json());
  const current = {
    temperature: parsed.current_weather.temperature,
    condition: weatherCodeLabel(parsed.current_weather.weathercode),
  };
  const hourly = parsed.hourly.time.slice(0, 6).map((time, index) => ({
    time,
    temperature: parsed.hourly.temperature_2m[index] ?? current.temperature,
    condition: weatherCodeLabel(parsed.hourly.weathercode[index] ?? parsed.current_weather.weathercode),
  }));
  const value = { current, hourly };
  rightNowWeatherCache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
};

export const fetchDaylight = async (lat: number, lng: number): Promise<DaylightData> => {
  const key = roundedKey(lat, lng);
  const cached = daylightCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const url = new URL("https://api.sunrise-sunset.org/json");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("formatted", "0");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Daylight unavailable.");
  }
  const parsed = sunriseSchema.parse(await response.json());
  const value = { sunrise: new Date(parsed.results.sunrise), sunset: new Date(parsed.results.sunset) };
  daylightCache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
};
