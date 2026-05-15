import { DocumentTypes, type DocumentType } from "@oh-writers/domain";

// ─── Narrative doc-type tab routing ──────────────────────────────────────────
// The shell renders a SegmentedControl across the 4 narrative routes.
// Both the active-tab resolution and the route mapping live here so they can
// be unit-tested without spinning up a router or DOM.

export type NarrativeTabId = "soggetto" | "synopsis" | "outline" | "treatment";

export const NARRATIVE_TAB_IDS: readonly NarrativeTabId[] = [
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
] as const;

export interface NarrativeTabOption {
  readonly id: NarrativeTabId;
  readonly label: string;
}

export const NARRATIVE_TAB_OPTIONS: readonly NarrativeTabOption[] = [
  { id: "soggetto", label: "Soggetto" },
  { id: "synopsis", label: "Sinossi" },
  { id: "outline", label: "Scaletta" },
  { id: "treatment", label: "Trattamento" },
] as const;

const DOC_TYPE_TO_TAB: Record<NarrativeTabId, DocumentType> = {
  soggetto: DocumentTypes.SOGGETTO,
  synopsis: DocumentTypes.SYNOPSIS,
  outline: DocumentTypes.OUTLINE,
  treatment: DocumentTypes.TREATMENT,
};

const TAB_TO_DOC_TYPE: Partial<Record<DocumentType, NarrativeTabId>> = {
  [DocumentTypes.SOGGETTO]: "soggetto",
  [DocumentTypes.SYNOPSIS]: "synopsis",
  [DocumentTypes.OUTLINE]: "outline",
  [DocumentTypes.TREATMENT]: "treatment",
};

export const tabIdFromDocType = (type: DocumentType): NarrativeTabId | null =>
  TAB_TO_DOC_TYPE[type] ?? null;

export const docTypeFromTabId = (tab: NarrativeTabId): DocumentType =>
  DOC_TYPE_TO_TAB[tab];

export const routePathFromTabId = (
  tab: NarrativeTabId,
  projectId: string,
): string => `/projects/${projectId}/${tab}`;

// ─── Treatment TOC extraction ────────────────────────────────────────────────
// Pulls headings from the saved HTML/prose content of the Trattamento. Lives
// here (not in a component) so it stays framework-agnostic and unit-testable.

export interface TreatmentHeading {
  readonly level: 1 | 2 | 3;
  readonly text: string;
  readonly id: string;
}

const slug = (raw: string, index: number): string => {
  const base = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return base.length > 0 ? `${base}-${index}` : `heading-${index}`;
};

const HEADING_REGEX = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;

export const extractTreatmentHeadings = (
  html: string,
): readonly TreatmentHeading[] => {
  if (typeof html !== "string" || html.length === 0) return [];
  const out: TreatmentHeading[] = [];
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = HEADING_REGEX.exec(html)) !== null) {
    const levelRaw = match[1] ?? "2";
    const level = Number.parseInt(levelRaw, 10) as 1 | 2 | 3;
    const rawText = match[2] ?? "";
    const text = rawText
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .trim();
    if (text.length === 0) continue;
    out.push({ level, text, id: slug(text, i) });
    i += 1;
  }
  return out;
};
