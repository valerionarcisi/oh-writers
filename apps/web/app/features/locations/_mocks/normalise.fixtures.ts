import type { LocationType } from "@oh-writers/domain";

/**
 * Deterministic MOCK_AI fixtures for requirement normalisation (spec 37, Step 1).
 *
 * Keyed by a lowercased requirement name. Mirrors the real seed set of
 * "Non fa ridere", where most requirements are set names of a single
 * restaurant ("Bancone", "Sala", "Cucina" …) and should collapse onto
 * one place type. Anything not listed falls back to "interno_generico".
 */
const FIXTURES: Readonly<
  Record<string, { locationType: LocationType; confidence: number }>
> = {
  bancone: { locationType: "bar", confidence: 0.85 },
  "angolo open grezzo": { locationType: "ristorante", confidence: 0.8 },
  sala: { locationType: "ristorante", confidence: 0.75 },
  cucina: { locationType: "ristorante", confidence: 0.82 },
  "fuori dalla porta": { locationType: "strada", confidence: 0.7 },
  "strada del paese": { locationType: "strada", confidence: 0.9 },
  "montage di filippo che lavora. comici che si alterano. pubblico ride.": {
    locationType: "altro",
    confidence: 0.3,
  },
};

const DEFAULT_VERDICT = {
  locationType: "interno_generico" as LocationType,
  confidence: 0.4,
};

export const findNormalisationFixture = (
  requirementName: string,
): { locationType: LocationType; confidence: number } =>
  FIXTURES[requirementName.trim().toLowerCase()] ?? DEFAULT_VERDICT;
