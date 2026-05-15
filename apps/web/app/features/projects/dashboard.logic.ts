import { DOCUMENT_PIPELINE, type DocumentType } from "@oh-writers/domain";

// Warm gradient palette derived from the design-system clay/leaf hues.
// Pure palette — kept as plain strings since deriving these from CSS tokens
// at render time would require a JS-side token resolver we don't have today.
// TODO: replace literals with CSS custom-property indirections once the DS
// exposes named gradient tokens (--ds-cover-warm, --ds-cover-cool, etc).
const COVER_GRADIENTS: ReadonlyArray<string> = [
  "linear-gradient(160deg, #5b2410, #a14a1c)",
  "linear-gradient(160deg, #14304a, #2b5c8a)",
  "linear-gradient(160deg, #2e3a16, #5a6b2a)",
  "linear-gradient(160deg, #3a1d4a, #6b3a8a)",
  "linear-gradient(160deg, #1d1d1b, #4a4a45)",
  "linear-gradient(160deg, #4a2c1a, #8a5a2c)",
];

// FNV-1a 32-bit hash — deterministic, no crypto needed for visual hashing.
const hashString = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

export const pickCoverGradient = (projectId: string): string => {
  const idx = hashString(projectId) % COVER_GRADIENTS.length;
  return COVER_GRADIENTS[idx] ?? COVER_GRADIENTS[0]!;
};

// Documents that count for completion (in addition to the screenplay).
const NARRATIVE_DOCS: ReadonlyArray<DocumentType> = DOCUMENT_PIPELINE;

export type CompletionInput = {
  readonly filledDocTypes: ReadonlyArray<DocumentType>;
  readonly hasScreenplay: boolean;
};

// Simplified completion algorithm — spec 12 placeholder.
// Each narrative doc (soggetto/synopsis/outline/treatment) contributes equally
// up to 80%; a non-empty screenplay adds the remaining 20%. The screenplay
// bonus is intentionally fixed: the page-level fidelity comes later when we
// have a "screenplay quality" signal worth weighting.
// TODO: weight by word count, by Cesare acceptance ratio, by schedule status.
export const computeProjectCompletion = (input: CompletionInput): number => {
  const docBudget = 80;
  const screenplayBudget = 20;
  const docs = NARRATIVE_DOCS.length;
  if (docs === 0) return input.hasScreenplay ? 100 : 0;

  const perDoc = docBudget / docs;
  const docScore = input.filledDocTypes.reduce(
    (acc, type) => (NARRATIVE_DOCS.includes(type) ? acc + perDoc : acc),
    0,
  );
  const screenplayScore = input.hasScreenplay ? screenplayBudget : 0;
  return Math.round(docScore + screenplayScore);
};

export type LastActivityKind =
  | "screenplay_edit"
  | "document_edit"
  | "project_created";

export type FormatLastActivityInput = {
  readonly updatedAtIso: string;
  readonly nowIso: string;
  readonly editorName: string | null;
  readonly kind: LastActivityKind;
};

// Compact human label — UI shows Italian copy. Times are bucketed into
// "qualche minuto fa / Nh fa / N giorni fa".
export const formatLastActivityLabel = ({
  updatedAtIso,
  nowIso,
  editorName,
  kind,
}: FormatLastActivityInput): string => {
  const updated = new Date(updatedAtIso).getTime();
  const now = new Date(nowIso).getTime();
  const diffMs = Math.max(0, now - updated);
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  const ago = (() => {
    if (minutes < 1) return "ora";
    if (minutes < 60) return `${minutes} min fa`;
    if (hours < 24) return `${hours}h fa`;
    if (days < 7) return `${days} g fa`;
    return `${Math.floor(days / 7)} sett fa`;
  })();

  const subject = editorName ?? (kind === "project_created" ? "creato" : "tu");
  return `${subject} · ${ago}`;
};
