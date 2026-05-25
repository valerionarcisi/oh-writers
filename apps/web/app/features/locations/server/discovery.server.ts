import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import {
  locationRequirements,
  locationRequirementScenes,
  locationCandidates,
} from "@oh-writers/db/schema";
import {
  LOCATION_CATEGORIES,
  type LocationType,
  type RequirementForMatch,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { ProjectAccessError } from "~/server/access";
import type { Db } from "~/server/db";
import { DbError } from "../locations.errors";
import {
  fetchNearbyPlaces,
  type PlaceSuggestion,
  type PlacesAutocompleteError,
} from "./places-autocomplete.server";
import {
  buildDiscoveredPlaces,
  type DiscoveredPlace,
  type SavedPoint,
} from "../lib/discovery";

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 50_000;

const DiscoverInputSchema = z.object({
  projectId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().min(MIN_RADIUS_M).max(MAX_RADIUS_M),
  query: z.string().max(120).optional(),
});

type DiscoverError = DbError | ProjectAccessError | PlacesAutocompleteError;

/** Suggestion paired with its thumbnail-bearing source so the UI keeps photos. */
export interface DiscoveryResult {
  readonly discovered: DiscoveredPlace;
  readonly suggestion: PlaceSuggestion;
}

const loadRequirementsAndPoints = (
  db: Db,
  projectId: string,
): ResultAsync<
  { requirements: RequirementForMatch[]; savedPoints: SavedPoint[] },
  DbError
> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(locationRequirements)
      .where(eq(locationRequirements.projectId, projectId)),
    (e) => new DbError("discovery/loadRequirements", e),
  ).andThen((reqRows) => {
    const typedRows = reqRows.filter((r) => r.locationType !== null);
    const reqIds = reqRows.map((r) => r.id);

    if (reqRows.length === 0) {
      return ResultAsync.fromSafePromise(
        Promise.resolve({
          requirements: [] as RequirementForMatch[],
          savedPoints: [] as SavedPoint[],
        }),
      );
    }

    return ResultAsync.fromPromise(
      Promise.all([
        db
          .select({
            name: locationCandidates.name,
            lat: locationCandidates.lat,
            lng: locationCandidates.lng,
          })
          .from(locationCandidates)
          .where(inArray(locationCandidates.requirementId, reqIds)),
        db
          .select({ requirementId: locationRequirementScenes.requirementId })
          .from(locationRequirementScenes)
          .where(inArray(locationRequirementScenes.requirementId, reqIds)),
      ]),
      (e) => new DbError("discovery/loadCandidatePoints", e),
    ).map(([candRows, sceneRows]) => {
      const sceneCountByReq = new Map<string, number>();
      for (const s of sceneRows) {
        sceneCountByReq.set(
          s.requirementId,
          (sceneCountByReq.get(s.requirementId) ?? 0) + 1,
        );
      }
      const requirements: RequirementForMatch[] = typedRows.map((r) => ({
        id: r.id,
        name: r.name,
        locationType: r.locationType as LocationType,
        sceneCount: sceneCountByReq.get(r.id) ?? 0,
      }));
      return {
        requirements,
        savedPoints: candRows.map((c) => ({
          name: c.name,
          lat: c.lat,
          lng: c.lng,
        })),
      };
    });
  });

/**
 * Discover real places in an area (spec 37, Phase 2). Loads the project's
 * resolved requirement types, queries Google Places nearby, drops places that
 * duplicate a saved candidate, and attaches the requirements each place could
 * serve. Returns hollow-pin data for the map.
 */
export const discoverPlacesInArea = createServerFn({ method: "POST" })
  .validator(DiscoverInputSchema)
  .handler(
    async ({ data }): Promise<ResultShape<DiscoveryResult[], DiscoverError>> =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          loadRequirementsAndPoints(db, access.project.id)
            .andThen((ctx) => {
              // Bias the nearby search to the Google types the project's
              // resolved requirements imply, so we discover relevant places
              // (a restaurant for a ristorante requirement) instead of every POI.
              // Some of our placeTypes (route, lodging…) aren't valid for the
              // Nearby endpoint and make it 400 — fall back to an unbiased
              // search so the user still sees candidates.
              const includedTypes = [
                ...new Set(
                  ctx.requirements.flatMap((r) =>
                    placeTypesForType(r.locationType),
                  ),
                ),
              ];
              const base = {
                lat: data.lat,
                lng: data.lng,
                radius_m: data.radius_m,
                query: data.query,
              };
              return fetchNearbyPlaces({ ...base, includedTypes })
                .orElse(() => fetchNearbyPlaces(base))
                .map((suggestions) => ({ ctx, suggestions }));
            })
            .map(({ ctx, suggestions }) => {
              const byPlaceId = new Map(suggestions.map((s) => [s.placeId, s]));
              const discovered = buildDiscoveredPlaces(
                suggestions.map((s) => ({
                  placeId: s.placeId,
                  name: s.name,
                  address: s.address,
                  lat: s.lat,
                  lng: s.lng,
                  types: s.types,
                })),
                ctx.savedPoints,
                ctx.requirements,
              );
              return discovered
                .map((d) => {
                  const suggestion = byPlaceId.get(d.place.placeId);
                  return suggestion ? { discovered: d, suggestion } : null;
                })
                .filter((r): r is DiscoveryResult => r !== null);
            }),
        ),
      ),
  );

/** Re-export so callers can derive Places `types` from resolved requirement types. */
export const placeTypesForType = (type: LocationType): readonly string[] =>
  LOCATION_CATEGORIES[type].placeTypes;
