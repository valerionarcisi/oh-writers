import { z } from "zod";

export const FundraisingSourceKindSchema = z.enum([
  "substack",
  "wordpress",
  "generic_rss",
  "atom",
]);
export type FundraisingSourceKind = z.infer<typeof FundraisingSourceKindSchema>;

export const FundraisingOpportunityKindSchema = z.enum([
  "bando_pubblico",
  "call_festival",
  "residenza",
  "grant_privato",
  "workshop",
  "pitch_forum",
  "other",
]);
export type FundraisingOpportunityKind = z.infer<
  typeof FundraisingOpportunityKindSchema
>;

export const FundraisingOpportunityStatusSchema = z.enum([
  "active",
  "expired",
  "unknown",
]);
export type FundraisingOpportunityStatus = z.infer<
  typeof FundraisingOpportunityStatusSchema
>;

export const FundraisingSaveStateSchema = z.enum([
  "saved",
  "dismissed",
  "applied",
]);
export type FundraisingSaveState = z.infer<typeof FundraisingSaveStateSchema>;

export const FundraisingEligibilitySchema = z.object({
  formats: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  careerStage: z.array(z.string()).optional(),
});
export type FundraisingEligibility = z.infer<
  typeof FundraisingEligibilitySchema
>;

export const FundraisingSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  feedUrl: z.string().url(),
  kind: FundraisingSourceKindSchema,
  language: z.string().min(2).max(5),
  isCurated: z.boolean(),
  isActive: z.boolean(),
  teamId: z.string().uuid().nullable(),
  lastFetchedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FundraisingSource = z.infer<typeof FundraisingSourceSchema>;

export const FundraisingItemSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  guid: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  publishedAt: z.string().datetime().nullable(),
  rawHtml: z.string(),
  rawText: z.string(),
  fetchedAt: z.string().datetime(),
});
export type FundraisingItem = z.infer<typeof FundraisingItemSchema>;

export const FundraisingOpportunitySchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  kind: FundraisingOpportunityKindSchema,
  title: z.string().min(1),
  summary: z.string(),
  organization: z.string().nullable(),
  deadlineAt: z.string().datetime().nullable(),
  deadlineText: z.string().nullable(),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  amountText: z.string().nullable(),
  eligibility: FundraisingEligibilitySchema,
  requirements: z.string().nullable(),
  link: z.string().url(),
  status: FundraisingOpportunityStatusSchema,
  confidence: z.number().min(0).max(1),
  classifiedAt: z.string().datetime(),
});
export type FundraisingOpportunity = z.infer<
  typeof FundraisingOpportunitySchema
>;

export const FundraisingClassificationSchema = z.object({
  kind: FundraisingOpportunityKindSchema,
  title: z.string().min(1),
  summary: z.string(),
  organization: z.string().nullable(),
  deadlineAt: z.string().datetime().nullable(),
  deadlineText: z.string().nullable(),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  amountText: z.string().nullable(),
  eligibility: FundraisingEligibilitySchema,
  requirements: z.string().nullable(),
  link: z.string().url(),
  confidence: z.number().min(0).max(1),
});
export type FundraisingClassification = z.infer<
  typeof FundraisingClassificationSchema
>;

export const FundraisingSaveSchema = z.object({
  id: z.string().uuid(),
  opportunityId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  state: FundraisingSaveStateSchema,
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FundraisingSave = z.infer<typeof FundraisingSaveSchema>;
