import { z } from "zod";
import { LOCATION_TYPES } from "@oh-writers/domain";

/**
 * Structured output of the requirement-normalisation Haiku call (spec 37, Step 1).
 * One verdict per unresolved requirement, keyed by requirement id, so a single
 * batch call can normalise the whole project at once — letting the model collapse
 * sibling set names ("Bancone", "Sala", "Cucina") onto one place type.
 */
export const NormalisationVerdictSchema = z.object({
  requirementId: z.string().uuid(),
  locationType: z.enum(LOCATION_TYPES),
  confidence: z.number().min(0).max(1),
});
export type NormalisationVerdict = z.infer<typeof NormalisationVerdictSchema>;

export const NormalisationOutputSchema = z.object({
  verdicts: z.array(NormalisationVerdictSchema),
});
export type NormalisationOutput = z.infer<typeof NormalisationOutputSchema>;

/**
 * Structured output of the atmosphere-ranking Haiku call (spec 37c). One verdict
 * per discovered place, keyed by placeId, scoring how well it fits the scene's
 * mood with a one-line Italian reason.
 */
export const RankVerdictSchema = z.object({
  placeId: z.string(),
  score: z.number().min(0).max(1),
  reason: z.string(),
});
export type RankVerdict = z.infer<typeof RankVerdictSchema>;

export const RankOutputSchema = z.object({
  rankings: z.array(RankVerdictSchema),
});
export type RankOutput = z.infer<typeof RankOutputSchema>;
