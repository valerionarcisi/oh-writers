import { z } from "zod";
import type { EditorialAdvice } from "./schema.js";

const normalizeTitle = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");

export const EditorialAdviceDecisionKeySchema = z.object({
  docType: z.string().min(1),
  sceneId: z.string().uuid().nullable(),
  area: z.string().min(1),
  anchorText: z.string(),
  titleFingerprint: z.string().min(1),
});

export type EditorialAdviceDecisionKey = z.infer<
  typeof EditorialAdviceDecisionKeySchema
>;

// The persistable subset of EditorialAdviceStatus — "open" is not a decision,
// it is the absence of one, so it is never written to storage.
export const DecidedEditorialAdviceStatusSchema = z.enum([
  "authorial_choice",
  "ignored",
  "resolved",
  "approved",
]);

export type DecidedEditorialAdviceStatus = z.infer<
  typeof DecidedEditorialAdviceStatusSchema
>;

type AnchorableAdvice = Pick<
  EditorialAdvice,
  "area" | "title" | "snippet" | "find"
>;
type AnchorTriple = Pick<
  EditorialAdviceDecisionKey,
  "area" | "anchorText" | "titleFingerprint"
>;

const anchorTriple = (advice: AnchorableAdvice): AnchorTriple => ({
  area: advice.area,
  anchorText: advice.snippet ?? advice.find ?? "",
  titleFingerprint: normalizeTitle(advice.title),
});

// Scope-free join of the anchor triple — the single definition of "how the
// anchor becomes a string key", shared by editorialAdviceMemoryKey (client
// lookup) and the decisions block renderer.
const anchorKey = ({
  area,
  anchorText,
  titleFingerprint,
}: AnchorTriple): string => [area, anchorText, titleFingerprint].join("|");

// The anchor is (area, anchor_text, title_fingerprint) — never the whole-document
// content fingerprint. That key survives unrelated edits elsewhere in the doc and
// only goes stale when the specific passage the note was about changes, which is
// exactly when the old decision should stop applying. See Spec 82.
export const buildEditorialAdviceDecisionKey = (
  advice: AnchorableAdvice,
  scope: { docType: string; sceneId?: string | null },
): EditorialAdviceDecisionKey => ({
  docType: scope.docType,
  sceneId: scope.sceneId ?? null,
  ...anchorTriple(advice),
});

// Scope-free lookup key for a single render's rememberedStatuses map, where
// docType/sceneId are constant across the whole set of advice items being
// rendered. Same anchor triple as buildEditorialAdviceDecisionKey.
export const editorialAdviceMemoryKey = (advice: AnchorableAdvice): string =>
  anchorKey(anchorTriple(advice));

// Same join applied to an already-persisted decision row, for callers (the
// memory hook) that need to key a lookup map from stored decisions rather
// than from a fresh EditorialAdvice item.
export const editorialAdviceDecisionMemoryKey = (
  decision: AnchorTriple,
): string => anchorKey(decision);

export type EditorialAdviceDecision = EditorialAdviceDecisionKey & {
  status: DecidedEditorialAdviceStatus;
};

const STATUS_LABEL_IT: Record<DecidedEditorialAdviceStatus, string> = {
  authorial_choice: "scelta autoriale",
  ignored: "ignorata",
  resolved: "risolta",
  approved: "approvata",
};

/**
 * Renders the anti-repetition context block Cesare receives before generating
 * new advice. Returns an empty string when there is nothing decided yet, so
 * callers never append an empty "Note già decise" header.
 */
export const buildEditorialAdviceDecisionsBlock = (
  decisions: readonly EditorialAdviceDecision[],
): string => {
  if (decisions.length === 0) return "";

  const lines = decisions.map((decision) => {
    const label = STATUS_LABEL_IT[decision.status];
    const anchor = decision.anchorText
      ? `"${decision.anchorText}"`
      : `nota "${decision.titleFingerprint}"`;
    return `- [${decision.area}] ${anchor} → ${label}`;
  });

  return [
    "Note già decise dall'autore (non riproporle nello stesso punto, a meno che il passaggio citato sia cambiato):",
    ...lines,
  ].join("\n");
};
