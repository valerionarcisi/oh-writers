import { z } from "zod";

export const SceneSummarySchema = z.object({
  sceneNumber: z.number().int().positive(),
  heading: z.string().min(1),
  settingDescription: z.string().min(1),
  timeOfDay: z.string().nullable(),
  presentCharacters: z.array(z.string()).max(20),
  keyActions: z.array(z.string()).max(5),
  productionNotes: z.array(z.string()).max(10),
  // Spec 81 — the scene's role in the story (e.g. "establishes Giulio's
  // desperation about the failing restaurant"). Optional + defaulted so summaries
  // distilled before this field parse cleanly; they re-distill lazily on next save.
  narrativePurpose: z.string().default(""),
});

export type SceneSummary = z.infer<typeof SceneSummarySchema>;
