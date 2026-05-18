import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  estimateDayDifficulty,
  type DayEstimate,
  type DayInput,
  type DayInputStrip,
  type WeatherFactor,
} from "@oh-writers/domain";
import type { ShootingDayView } from "../server/schedule.server";
import { weatherQueryOptions } from "../server/weather.server";

export interface DayWeatherAnchor {
  readonly lat: number;
  readonly lng: number;
}

interface UseDayEstimateInput {
  readonly day: ShootingDayView;
  readonly weatherAnchor: DayWeatherAnchor | null;
}

interface UseDayEstimateResult {
  readonly estimate: DayEstimate;
  readonly weather: WeatherFactor | null;
  readonly isWeatherLoading: boolean;
}

const toDayInput = (day: ShootingDayView): DayInput => {
  const strips: DayInputStrip[] = day.strips.map((s) => ({
    sceneNumber: s.sceneNumber,
    intExt:
      s.intExt === "EXT" || s.intExt === "INT/EXT"
        ? (s.intExt as "EXT" | "INT/EXT")
        : "INT",
    timeOfDay: s.timeOfDay,
    // castCount and effects are not yet denormalized into the strip view.
    // Use neutral defaults until the schedule view exposes them. Cesare
    // tools (and future predictions) can refine with full data.
    castCount: 2,
    hasVfx: false,
    hasSfx: false,
    locationName: s.location,
  }));
  return { strips, estimatedHours: day.totalHours };
};

const hasExteriorScene = (day: ShootingDayView): boolean =>
  day.strips.some((s) => s.intExt === "EXT" || s.intExt === "INT/EXT");

export const useDayEstimate = ({
  day,
  weatherAnchor,
}: UseDayEstimateInput): UseDayEstimateResult => {
  const exteriorPresent = hasExteriorScene(day);
  const shouldFetchWeather = exteriorPresent && day.date !== null && weatherAnchor !== null;

  const weatherQuery = useQuery({
    ...weatherQueryOptions({
      lat: weatherAnchor?.lat ?? 0,
      lng: weatherAnchor?.lng ?? 0,
      date: day.date ?? "1970-01-01",
    }),
    enabled: shouldFetchWeather,
  });

  const weather: WeatherFactor | null = useMemo(() => {
    if (!shouldFetchWeather) return null;
    const data = weatherQuery.data;
    if (!data || !data.isOk) return null;
    return data.value;
  }, [shouldFetchWeather, weatherQuery.data]);

  const estimate = useMemo(
    () => estimateDayDifficulty(toDayInput(day), weather),
    [day, weather],
  );

  return {
    estimate,
    weather,
    isWeatherLoading: shouldFetchWeather && weatherQuery.isLoading,
  };
};
