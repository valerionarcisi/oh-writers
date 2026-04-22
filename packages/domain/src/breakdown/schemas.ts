import { z } from "zod";
import { BREAKDOWN_CATEGORIES } from "./categories.js";
import { CAST_TIERS } from "./cast-tiers.js";

export const BreakdownCategorySchema = z.enum(BREAKDOWN_CATEGORIES);
export const CesareStatusSchema = z.enum(["pending", "accepted", "ignored"]);
export const CastTierSchema = z.enum(CAST_TIERS);

export const BreakdownElementSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  category: BreakdownCategorySchema,
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  castTier: CastTierSchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BreakdownElement = z.infer<typeof BreakdownElementSchema>;

export const BreakdownOccurrenceSchema = z.object({
  id: z.string().uuid(),
  elementId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
  sceneId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  note: z.string().nullable(),
  cesareStatus: CesareStatusSchema,
  isStale: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BreakdownOccurrence = z.infer<typeof BreakdownOccurrenceSchema>;

export const CesareSuggestionSchema = z.object({
  category: BreakdownCategorySchema,
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive().default(1),
  description: z.string().nullable(),
  rationale: z.string().nullable(),
});
export const SuggestionListSchema = z.object({
  suggestions: z.array(CesareSuggestionSchema),
});
export type CesareSuggestion = z.infer<typeof CesareSuggestionSchema>;
