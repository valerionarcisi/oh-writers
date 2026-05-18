import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { locationsQueryOptions } from "~/features/locations/server/locations.server";
import type { DayWeatherAnchor } from "./useDayEstimate";

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokens = (s: string): string[] =>
  normalize(s)
    .split(" ")
    .filter((t) => t.length >= 3);

interface AnchorEntry extends DayWeatherAnchor {
  readonly normalizedTokens: ReadonlyArray<string>;
}

export interface LocationAnchorLookup {
  readonly findByName: (sceneLocation: string) => DayWeatherAnchor | null;
}

export const useLocationAnchors = (projectId: string): LocationAnchorLookup => {
  const { data } = useQuery(locationsQueryOptions(projectId));
  const requirements = data?.isOk ? data.value : [];

  const anchors = useMemo<AnchorEntry[]>(() => {
    const out: AnchorEntry[] = [];
    for (const req of requirements) {
      // Prefer the first candidate that has coordinates (typically the chosen one).
      const candidate =
        req.candidates.find((c) => c.lat !== null && c.lng !== null) ?? null;
      if (!candidate || candidate.lat === null || candidate.lng === null) {
        continue;
      }
      out.push({
        lat: candidate.lat,
        lng: candidate.lng,
        normalizedTokens: tokens(req.name),
      });
    }
    return out;
  }, [requirements]);

  return useMemo<LocationAnchorLookup>(
    () => ({
      findByName: (sceneLocation: string): DayWeatherAnchor | null => {
        const sceneTokens = tokens(sceneLocation);
        if (sceneTokens.length === 0 || anchors.length === 0) return null;
        let best: AnchorEntry | null = null;
        let bestScore = 0;
        for (const anchor of anchors) {
          const score = anchor.normalizedTokens.filter((t) =>
            sceneTokens.includes(t),
          ).length;
          if (score > bestScore) {
            bestScore = score;
            best = anchor;
          }
        }
        return best ? { lat: best.lat, lng: best.lng } : null;
      },
    }),
    [anchors],
  );
};

export const pickPrimaryExteriorLocation = (
  strips: ReadonlyArray<{ intExt: string; location: string }>,
): string | null => {
  for (const s of strips) {
    if (s.intExt === "EXT" || s.intExt === "INT/EXT") return s.location;
  }
  return null;
};
