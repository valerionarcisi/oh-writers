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
  searchTypesForType,
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
  /** When set, discovery is scoped to this requirement's location type. */
  requirementId: z.string().uuid().optional(),
});

type DiscoverError = DbError | ProjectAccessError | PlacesAutocompleteError;

/** Suggestion paired with its thumbnail-bearing source so the UI keeps photos. */
export interface DiscoveryResult {
  readonly discovered: DiscoveredPlace;
  readonly suggestion: PlaceSuggestion;
}

/**
 * Discovery response. `places` is the hollow-pin data; `skipped` explains why a
 * scene can't be type-discovered (e.g. a street) so the UI can guide the user.
 */
export interface DiscoveryResponse {
  readonly places: DiscoveryResult[];
  readonly skipped: {
    readonly reason: "not-searchable";
    readonly type: LocationType;
  } | null;
}

interface DiscoveryContext {
  readonly requirements: RequirementForMatch[];
  readonly savedPoints: SavedPoint[];
}

const loadRequirementsAndPoints = (
  db: Db,
  projectId: string,
): ResultAsync<DiscoveryContext, DbError> =>
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
 * Pick the requirements that drive discovery, plus the Google search types.
 *  - requirementId set → just that requirement; its type decides the search.
 *  - no requirementId → every resolved requirement; search the union of types.
 * Returns null searchTypes when nothing is searchable by type.
 */
const planDiscovery = (
  ctx: DiscoveryContext,
  requirementId: string | undefined,
): {
  matchAgainst: RequirementForMatch[];
  searchTypes: string[];
  skipped: DiscoveryResponse["skipped"];
} => {
  if (requirementId) {
    const req = ctx.requirements.find((r) => r.id === requirementId);
    if (!req) return { matchAgainst: [], searchTypes: [], skipped: null };
    const searchTypes = [...searchTypesForType(req.locationType)];
    if (searchTypes.length === 0) {
      return {
        matchAgainst: [req],
        searchTypes: [],
        skipped: { reason: "not-searchable", type: req.locationType },
      };
    }
    return { matchAgainst: [req], searchTypes, skipped: null };
  }
  // No selection: union of every requirement's valid search types.
  const searchTypes = [
    ...new Set(
      ctx.requirements.flatMap((r) => searchTypesForType(r.locationType)),
    ),
  ];
  return { matchAgainst: ctx.requirements, searchTypes, skipped: null };
};

const toResults = (
  suggestions: PlaceSuggestion[],
  ctx: DiscoveryContext,
  matchAgainst: RequirementForMatch[],
): DiscoveryResult[] => {
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
    matchAgainst,
  );
  return discovered
    .map((d) => {
      const suggestion = byPlaceId.get(d.place.placeId);
      return suggestion ? { discovered: d, suggestion } : null;
    })
    .filter((r): r is DiscoveryResult => r !== null);
};

/**
 * Discover real places in an area (spec 37, Phase 2 + 37b scene-aware).
 * Scoped to the selected requirement's location type when `requirementId` is
 * given; otherwise the union of the project's searchable types. Non-searchable
 * categories (a street, a generic interior) return `skipped` so the UI explains
 * why there are no pins. No unfiltered fallback — a 400 is a real error now.
 */
export const discoverPlacesInArea = createServerFn({ method: "POST" })
  .validator(DiscoverInputSchema)
  .handler(
    async ({ data }): Promise<ResultShape<DiscoveryResponse, DiscoverError>> =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          loadRequirementsAndPoints(db, access.project.id).andThen((ctx) => {
            const plan = planDiscovery(ctx, data.requirementId);

            // A free-text query overrides the type filter (the user knows best);
            // otherwise we need at least one valid search type to query.
            const hasQuery = !!data.query && data.query.trim().length > 0;
            if (!hasQuery && plan.searchTypes.length === 0) {
              return ResultAsync.fromSafePromise(
                Promise.resolve<DiscoveryResponse>({
                  places: [],
                  skipped: plan.skipped,
                }),
              );
            }

            return fetchNearbyPlaces({
              lat: data.lat,
              lng: data.lng,
              radius_m: data.radius_m,
              query: data.query,
              includedTypes: hasQuery ? undefined : plan.searchTypes,
            }).map((suggestions) => ({
              places: toResults(suggestions, ctx, plan.matchAgainst),
              skipped: null,
            }));
          }),
        ),
      ),
  );
