/**
 * Cross-match helper (spec 37, Phase 1).
 *
 * Given the project's requirements (each carrying a resolved locationType) and
 * their saved candidates, compute — for each candidate — the OTHER requirements
 * it could also serve. This powers the affinity chips: "questo posto va bene
 * anche per [Sala] (2 scene)".
 *
 * Pure: wraps the framework-agnostic buildAffinities, no React/Leaflet/server.
 */

import {
  buildAffinities,
  type LocationType,
  type RequirementForMatch,
  type RequirementMatch,
} from "@oh-writers/domain";
import type { LocationRequirement } from "@oh-writers/domain";

export interface CandidateCrossMatch {
  readonly requirementId: string;
  readonly requirementName: string;
  readonly sceneCount: number;
}

/** Map of candidateId → other requirements it could also serve (excludes its owner). */
export type CrossMatchMap = ReadonlyMap<string, readonly CandidateCrossMatch[]>;

const toRequirementForMatch = (
  req: LocationRequirement,
): RequirementForMatch | null =>
  req.locationType
    ? {
        id: req.id,
        name: req.name,
        locationType: req.locationType as LocationType,
        sceneCount: req.sceneCount,
      }
    : null;

/**
 * Build the cross-match map. A candidate is matched against every requirement
 * except the one that owns it; only requirements with a resolved type and a
 * positive match are kept.
 */
export const buildCrossMatches = (
  requirements: readonly LocationRequirement[],
): CrossMatchMap => {
  const typedRequirements = requirements
    .map(toRequirementForMatch)
    .filter((r): r is RequirementForMatch => r !== null);

  const result = new Map<string, CandidateCrossMatch[]>();

  for (const req of requirements) {
    for (const candidate of req.candidates) {
      const others = typedRequirements.filter((r) => r.id !== req.id);
      const [affinity] = buildAffinities(others, [
        {
          placeKey: candidate.id,
          name: candidate.name,
          address: candidate.address,
          placeTypes: [],
        },
      ]);
      const matches = (affinity?.matches ?? []).map(
        (m: RequirementMatch): CandidateCrossMatch => ({
          requirementId: m.requirementId,
          requirementName: m.requirementName,
          sceneCount: m.sceneCount,
        }),
      );
      if (matches.length > 0) result.set(candidate.id, matches);
    }
  }

  return result;
};
