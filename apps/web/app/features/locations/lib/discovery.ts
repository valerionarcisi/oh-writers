/**
 * Discovery helpers (spec 37, Phase 2) — pure, no I/O.
 *
 * A discovered Google Places result is a "hollow pin" the user can add as a
 * candidate. These helpers decide which discovered places are NEW (not already
 * a saved candidate) and which saved requirement each best fits.
 */

import {
  buildAffinities,
  type LocationType,
  type RequirementForMatch,
} from "@oh-writers/domain";

export interface DiscoveryPlace {
  readonly placeId: string;
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
  readonly types: readonly string[];
}

export interface SavedPoint {
  readonly name: string;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** Best-matching requirement for a discovered place, with its scene context. */
export interface DiscoveryMatch {
  readonly requirementId: string;
  readonly requirementName: string;
  readonly sceneCount: number;
  readonly score: number;
}

export interface DiscoveredPlace {
  readonly place: DiscoveryPlace;
  /** Requirements this place could serve, best first. Empty if none match. */
  readonly matches: readonly DiscoveryMatch[];
}

const DEDUP_RADIUS_M = 40;

/** Haversine distance in metres between two lat/lng points. */
const distanceMeters = (
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const normaliseName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

/** A discovered place duplicates a saved point if it is close AND name-similar. */
const isDuplicate = (place: DiscoveryPlace, saved: SavedPoint): boolean => {
  if (saved.lat == null || saved.lng == null) return false;
  const close =
    distanceMeters(place.lat, place.lng, saved.lat, saved.lng) <=
    DEDUP_RADIUS_M;
  if (!close) return false;
  const a = normaliseName(place.name);
  const b = normaliseName(saved.name);
  return a.length > 0 && (a === b || a.includes(b) || b.includes(a));
};

/**
 * Filter out discovered places that duplicate an already-saved candidate, then
 * attach the requirements each remaining place could serve (best first).
 */
export const buildDiscoveredPlaces = (
  places: readonly DiscoveryPlace[],
  savedPoints: readonly SavedPoint[],
  requirements: readonly RequirementForMatch[],
): readonly DiscoveredPlace[] => {
  const fresh = places.filter(
    (p) => !savedPoints.some((s) => isDuplicate(p, s)),
  );

  const affinities = buildAffinities(
    requirements,
    fresh.map((p) => ({
      placeKey: p.placeId,
      name: p.name,
      address: p.address,
      placeTypes: p.types,
    })),
  );
  const affinityByKey = new Map(affinities.map((a) => [a.placeKey, a]));

  return fresh.map((place) => {
    const affinity = affinityByKey.get(place.placeId);
    const matches: DiscoveryMatch[] = (affinity?.matches ?? []).map((m) => ({
      requirementId: m.requirementId,
      requirementName: m.requirementName,
      sceneCount: m.sceneCount,
      score: m.verdict.score,
    }));
    return { place, matches };
  });
};

/** Collect the Google Places `types` to bias an area query, from resolved requirement types. */
export const placeTypesForRequirements = (
  requirements: readonly { locationType: LocationType }[],
  categoryPlaceTypes: (type: LocationType) => readonly string[],
): string[] => {
  const set = new Set<string>();
  for (const req of requirements) {
    for (const t of categoryPlaceTypes(req.locationType)) set.add(t);
  }
  return [...set];
};
