import { z } from "zod";

export const EditorialAdviceTypeSchema = z.enum([
  "real_problem",
  "risk",
  "authorial_choice",
  "optional",
  "already_resolved",
  "approved",
]);

export const EditorialAdviceSeveritySchema = z.enum([
  "high",
  "medium",
  "low",
  "optional",
]);

export const EditorialAdviceStatusSchema = z.enum([
  "open",
  "ignored",
  "authorial_choice",
  "resolved",
  "approved",
]);

export const EditorialAdviceAreaSchema = z.string().min(1).max(40);

export const EditorialAdviceSchema = z.object({
  id: z.string().min(1),
  area: EditorialAdviceAreaSchema,
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(360),
  type: EditorialAdviceTypeSchema,
  severity: EditorialAdviceSeveritySchema,
  status: EditorialAdviceStatusSchema.optional(),
  whyItMatters: z.string().min(1).max(240).optional(),
  whenToIgnore: z.string().min(1).max(240).optional(),
  minimalIntervention: z.string().min(1).max(240).optional(),
  scene: z.number().int().positive().optional(),
  snippet: z.string().max(160).nullable().optional(),
  find: z.string().max(400).nullable().optional(),
  replace: z.string().max(800).nullable().optional(),
});

export const EditorialAdviceListSchema = z.object({
  suggestions: z.array(EditorialAdviceSchema).max(12),
});

export type EditorialAdvice = z.infer<typeof EditorialAdviceSchema>;
export type EditorialAdviceType = z.infer<typeof EditorialAdviceTypeSchema>;
export type EditorialAdviceSeverity = z.infer<
  typeof EditorialAdviceSeveritySchema
>;
export type EditorialAdviceStatus = z.infer<typeof EditorialAdviceStatusSchema>;

export const EDITORIAL_ADVICE_SEVERITY_RANK: Readonly<
  Record<EditorialAdviceSeverity, number>
> = {
  high: 0,
  medium: 1,
  low: 2,
  optional: 3,
};

export const EDITORIAL_ADVICE_TYPE_RANK: Readonly<
  Record<EditorialAdviceType, number>
> = {
  real_problem: 0,
  risk: 1,
  authorial_choice: 2,
  optional: 3,
  already_resolved: 4,
  approved: 5,
};

const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");

export const adviceFingerprint = (advice: EditorialAdvice): string =>
  [
    advice.area,
    advice.type,
    normalizeText(advice.title),
    normalizeText(advice.body),
  ].join("|");

export const dedupeEditorialAdvice = (
  suggestions: readonly EditorialAdvice[],
): EditorialAdvice[] => {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const fingerprint = adviceFingerprint(suggestion);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
};

export const sortEditorialAdvice = (
  suggestions: readonly EditorialAdvice[],
): EditorialAdvice[] =>
  [...suggestions].sort((left, right) => {
    const severityDiff =
      EDITORIAL_ADVICE_SEVERITY_RANK[left.severity] -
      EDITORIAL_ADVICE_SEVERITY_RANK[right.severity];
    if (severityDiff !== 0) return severityDiff;
    const typeDiff =
      EDITORIAL_ADVICE_TYPE_RANK[left.type] -
      EDITORIAL_ADVICE_TYPE_RANK[right.type];
    if (typeDiff !== 0) return typeDiff;
    return left.title.localeCompare(right.title, "it");
  });

export const createEditorialApprovalAdvice = (
  area: string,
  overrides: Partial<EditorialAdvice> = {},
): EditorialAdvice => ({
  id: `approved-${area}`,
  area,
  title: "OK editoriale",
  body: "Questa area funziona. Non emergono problemi narrativi rilevanti. Procederei solo con rifiniture leggere.",
  type: "approved",
  severity: "optional",
  status: "approved",
  whyItMatters:
    "Cesare deve saper chiudere il giro editoriale quando restano solo preferenze o micro-ritocchi.",
  ...overrides,
});
