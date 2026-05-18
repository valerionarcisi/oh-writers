import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync, ok } from "neverthrow";
import { toShape } from "@oh-writers/utils";
import type { WeatherFactor } from "@oh-writers/domain";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class WeatherFetchError {
  readonly _tag = "WeatherFetchError" as const;
  readonly message: string;
  constructor(readonly cause: string) {
    this.message = `Weather fetch failed: ${cause}`;
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────

const WeatherInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});

// ─── Open-Meteo response shape ────────────────────────────────────────────────

interface OpenMeteoDaily {
  time?: string[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
  weathercode?: number[];
  windspeed_10m_max?: number[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
  error?: boolean;
  reason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_FORECAST_DAYS = 16;

// WMO weather codes — https://open-meteo.com/en/docs (see "weathercode" table)
const conditionFromCode = (code: number): WeatherFactor["conditions"] => {
  if (code === 0) return "clear";
  if (code >= 1 && code <= 3) return "cloudy";
  if (code >= 45 && code <= 48) return "cloudy"; // fog
  if (code >= 51 && code <= 67) return "rain"; // drizzle / rain
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain"; // rain showers
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "unknown";
};

const isWithinForecastWindow = (date: string): boolean => {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return false;
  const now = Date.now();
  const diffDays = Math.floor((target - now) / (1000 * 60 * 60 * 24));
  return diffDays >= -1 && diffDays <= MAX_FORECAST_DAYS;
};

const unknownWeather = (): WeatherFactor => ({
  rainProbability: 0,
  windKmh: 0,
  tempMin: 0,
  tempMax: 0,
  conditions: "unknown",
});

const fetchOpenMeteo = (
  lat: number,
  lng: number,
  date: string,
): ResultAsync<WeatherFactor, WeatherFetchError> =>
  ResultAsync.fromPromise(
    (async (): Promise<WeatherFactor> => {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lng}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max` +
        `&timezone=Europe%2FRome` +
        `&start_date=${date}&end_date=${date}`;

      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          `Open-Meteo HTTP ${response.status} ${response.statusText}`,
        );
      }
      const json = (await response.json()) as OpenMeteoResponse;
      if (json.error) {
        throw new Error(json.reason ?? "Open-Meteo returned error=true");
      }
      const daily = json.daily;
      if (!daily || !daily.time || daily.time.length === 0) {
        throw new Error("Open-Meteo response missing daily data");
      }
      const code = daily.weathercode?.[0] ?? 0;
      return {
        rainProbability: daily.precipitation_probability_max?.[0] ?? 0,
        windKmh: daily.windspeed_10m_max?.[0] ?? 0,
        tempMin: daily.temperature_2m_min?.[0] ?? 0,
        tempMax: daily.temperature_2m_max?.[0] ?? 0,
        conditions: conditionFromCode(code),
      };
    })(),
    (e) =>
      new WeatherFetchError(e instanceof Error ? e.message : String(e)),
  );

// ─── Server function ──────────────────────────────────────────────────────────

export const getWeatherForecast = createServerFn({ method: "GET" })
  .validator(WeatherInputSchema)
  .handler(async ({ data }) => {
    if (!isWithinForecastWindow(data.date)) {
      return toShape(ok<WeatherFactor, WeatherFetchError>(unknownWeather()));
    }
    return toShape(await fetchOpenMeteo(data.lat, data.lng, data.date));
  });

// ─── TanStack Query options (1-hour cache) ────────────────────────────────────

export interface WeatherQueryKeyInput {
  readonly lat: number;
  readonly lng: number;
  readonly date: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

export const weatherQueryOptions = (input: WeatherQueryKeyInput) => ({
  queryKey: [
    "weather",
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    input.date,
  ] as const,
  queryFn: () =>
    getWeatherForecast({
      data: { lat: input.lat, lng: input.lng, date: input.date },
    }),
  staleTime: ONE_HOUR_MS,
  gcTime: ONE_HOUR_MS * 2,
});
