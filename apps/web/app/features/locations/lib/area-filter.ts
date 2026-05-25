/**
 * Area filter types and hit-test helpers.
 *
 * Pure functions — no Leaflet, no React, no server imports.
 * The hit-test uses @turf/boolean-point-in-polygon so it works with any
 * GeoJSON polygon geometry (Nominatim boundary or drawn shape).
 */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";
import type { LocationCandidate } from "@oh-writers/domain";

export type AreaFilterResult =
  | {
      readonly kind: "boundary";
      /** Human-readable label, e.g. "Falerone". */
      readonly label: string;
      readonly matchingCandidateIds: string[];
      readonly geojson: GeoJSON.Geometry;
    }
  | {
      readonly kind: "drawn";
      /** Human-readable label, e.g. "Area disegnata". */
      readonly label: string;
      readonly matchingCandidateIds: string[];
    };

interface CandidateWithCoords {
  id: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
}

/**
 * Returns the IDs of candidates that fall inside the given GeoJSON polygon
 * geometry. Candidates without coordinates are excluded.
 */
export const filterCandidatesInPolygon = (
  candidates: ReadonlyArray<CandidateWithCoords>,
  polygon: GeoJSON.Geometry,
): string[] => {
  // booleanPointInPolygon accepts Polygon or MultiPolygon features/geometries.
  if (polygon.type !== "Polygon" && polygon.type !== "MultiPolygon") return [];

  const feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: "Feature",
    geometry: polygon as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    properties: {},
  };

  return candidates
    .filter(
      (c): c is CandidateWithCoords & { lat: number; lng: number } =>
        c.lat != null && c.lng != null,
    )
    .filter((c) => booleanPointInPolygon(turfPoint([c.lng, c.lat]), feature))
    .map((c) => c.id);
};

/**
 * Collect all candidates from a flat requirements list.
 */
export const collectAllCandidates = (
  requirements: ReadonlyArray<{
    candidates: ReadonlyArray<LocationCandidate>;
  }>,
): LocationCandidate[] => requirements.flatMap((r) => r.candidates);
