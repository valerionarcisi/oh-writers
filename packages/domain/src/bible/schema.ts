import { z } from "zod";

export const RecurringLocationSchema = z.object({
  canonicalName: z.string().min(1),
  aliases: z.array(z.string()),
  locationType: z.string(),
  sceneCount: z.number().int().nonnegative(),
  settingPrior: z.string(),
});

export type RecurringLocation = z.infer<typeof RecurringLocationSchema>;

export const KeyCharacterSchema = z.object({
  name: z.string().min(1),
  role: z.string(),
  arc: z.string().nullable(),
});

export type KeyCharacter = z.infer<typeof KeyCharacterSchema>;

export const FilmBibleSchema = z.object({
  schemaVersion: z.literal("1").default("1"),
  settingSummary: z.string().min(1),
  genreAndTone: z.string().min(1),
  centralConflict: z.string().min(1),
  productionConstraints: z.array(z.string()).max(20),
  recurringLocations: z.array(RecurringLocationSchema),
  keyCharacters: z.array(KeyCharacterSchema).max(30),
  sourceDocumentSnapshot: z.string(),
});

export type FilmBible = z.infer<typeof FilmBibleSchema>;
