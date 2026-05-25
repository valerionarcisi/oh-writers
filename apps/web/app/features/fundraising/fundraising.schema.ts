import { z } from "zod";

export const FundraisingOpportunityOutputSchema = z.object({
  kind: z.enum([
    "bando_pubblico",
    "call_festival",
    "residenza",
    "grant_privato",
    "workshop",
    "pitch_forum",
    "other",
  ]),
  title: z.string(),
  summary: z.string(),
  organization: z.string().nullable(),
  deadline_text: z.string().nullable(),
  // ISO string, null if unparseable
  deadline_at: z.string().nullable(),
  amount_min: z.number().nullable(),
  amount_max: z.number().nullable(),
  amount_text: z.string().nullable(),
  eligibility: z.object({
    formats: z.array(z.string()),
    genres: z.array(z.string()),
    regions: z.array(z.string()),
    career_stage: z.array(z.string()),
  }),
  requirements: z.string().nullable(),
  link: z.string(),
  confidence: z.number().min(0).max(1),
});

export type FundraisingOpportunityOutput = z.infer<
  typeof FundraisingOpportunityOutputSchema
>;
