import { z } from "zod";
import { nowIso } from "../firebase/timestampMapper";
import { publicGeoProvider } from "./publicGeoProvider";
import type { WeatherContext, WeatherProvider } from "./contracts";

const currentWeatherSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    precipitation_probability: z.number().optional(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
  }),
});

const forecastSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    precipitation_probability_max: z.array(z.number().optional()),
    temperature_2m_max: z.array(z.number()),
    weather_code: z.array(z.number()),
    wind_speed_10m_max: z.array(z.number()),
  }),
});

const weatherCodeLabel = (code: number): string => {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Rain likely";
  if ([71, 73, 75, 85, 86].includes(code)) return "Snow likely";
  if ([95, 96, 99].includes(code)) return "Thunderstorm risk";
  return "Variable conditions";
};

export const publicWeatherProvider: WeatherProvider = {
  getCurrentWeatherAt: async (point) => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(point.latitude));
    url.searchParams.set("longitude", String(point.longitude));
    url.searchParams.set("current", "temperature_2m,precipitation_probability,weather_code,wind_speed_10m");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Weather provider failed");
    }

    const result = currentWeatherSchema.parse(await response.json());
    return {
      locationLabel: point.label,
      temperatureC: result.current.temperature_2m,
      condition: weatherCodeLabel(result.current.weather_code),
      precipitationChance: result.current.precipitation_probability ?? 0,
      windKph: result.current.wind_speed_10m,
      observedAt: nowIso(),
      certainty: "live",
    };
  },

  getCurrentWeather: async (locationLabel) => {
    const point = await publicGeoProvider.geocode(locationLabel);
    return publicWeatherProvider.getCurrentWeatherAt(point);
  },

  getForecast: async (locationLabel, dateRange) => {
    const point = await publicGeoProvider.geocode(locationLabel);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(point.latitude));
    url.searchParams.set("longitude", String(point.longitude));
    url.searchParams.set("daily", "weather_code,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max");
    url.searchParams.set("start_date", dateRange.start);
    url.searchParams.set("end_date", dateRange.end);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Forecast provider failed");
    }

    const result = forecastSchema.parse(await response.json());
    return result.daily.time.map((date, index): WeatherContext => ({
      locationLabel: `${point.label} ${date}`,
      temperatureC: result.daily.temperature_2m_max[index] ?? 0,
      condition: weatherCodeLabel(result.daily.weather_code[index] ?? 3),
      precipitationChance: result.daily.precipitation_probability_max[index] ?? 0,
      windKph: result.daily.wind_speed_10m_max[index] ?? 0,
      observedAt: nowIso(),
      certainty: "live",
    }));
  },
};
