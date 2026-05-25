/**
 * Area filter types and hit-test helpers.
 *
 * Pure functions — no Leaflet, no React, no server imports.
 * The hit-test uses @turf/boolean-point-in-polygon so it works with any
 * GeoJSON polygon geometry (Nominatim boundary or drawn shape).
 */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
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

  return (
    candidates
      .filter(
        (c): c is CandidateWithCoords & { lat: number; lng: number } =>
          c.lat != null && c.lng != null,
      )
      // Pass the raw [lng, lat] coordinate directly — booleanPointInPolygon's
      // getCoord() accepts a position array, so we avoid importing @turf/helpers
      // (its ESM barrel re-exports a type, which breaks Vite's strict analysis).
      .filter((c) => booleanPointInPolygon([c.lng, c.lat], feature))
      .map((c) => c.id)
  );
};

/**
 * Reduce a polygon/multipolygon geometry to a covering circle: the centre of
 * its bounding box plus a radius that reaches the farthest corner. Used to bias
 * a Google Places nearby query to the selected boundary. Returns null for
 * non-polygon geometries.
 */
export const geometryToCircle = (
  geometry: GeoJSON.Geometry,
): { lat: number; lng: number; radius_m: number } | null => {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    return null;
  }
  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.coordinates.flat();
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const position of ring) {
      const lng = position[0];
      const lat = position[1];
      if (lng == null || lat == null) continue;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Approximate metres-per-degree at this latitude, then half-diagonal radius.
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((centerLat * Math.PI) / 180);
  const halfH = ((maxLat - minLat) / 2) * mPerDegLat;
  const halfW = ((maxLng - minLng) / 2) * mPerDegLng;
  const radius_m = Math.sqrt(halfH * halfH + halfW * halfW);

  return { lat: centerLat, lng: centerLng, radius_m };
};

/**
 * Collect all candidates from a flat requirements list.
 */
export const collectAllCandidates = (
  requirements: ReadonlyArray<{
    candidates: ReadonlyArray<LocationCandidate>;
  }>,
): LocationCandidate[] => requirements.flatMap((r) => r.candidates);
