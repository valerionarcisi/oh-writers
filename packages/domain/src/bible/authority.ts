import type { DocumentType } from "../constants.js";

/**
 * Authority ordering for narrative documents.
 * Higher index = higher authority when facts conflict.
 */
export const DOC_AUTHORITY: ReadonlyArray<DocumentType> = [
  "logline",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
] as const;

const authorityRank = (docType: DocumentType): number => {
  const idx = DOC_AUTHORITY.indexOf(docType);
  return idx === -1 ? -1 : idx;
};

export interface SourcedFact {
  readonly value: string;
  readonly source: DocumentType;
}

export type ResolvedFact =
  | {
      readonly status: "resolved";
      readonly value: string;
      readonly source: DocumentType;
    }
  | {
      readonly status: "contested";
      readonly candidates: ReadonlyArray<SourcedFact>;
    };

/**
 * Pick the highest-authority fact from competing sources.
 * When two facts share the same authority rank but differ in value, mark as contested.
 */
export const resolveFact = (
  facts: ReadonlyArray<SourcedFact>,
): ResolvedFact => {
  if (facts.length === 0) {
    return { status: "contested", candidates: [] };
  }

  const sorted = [...facts].sort(
    (a, b) => authorityRank(b.source) - authorityRank(a.source),
  );

  const topRank = authorityRank(sorted[0]!.source);
  const topFacts = sorted.filter((f) => authorityRank(f.source) === topRank);

  const uniqueValues = new Set(topFacts.map((f) => f.value));
  if (uniqueValues.size === 1) {
    return {
      status: "resolved",
      value: sorted[0]!.value,
      source: sorted[0]!.source,
    };
  }

  return { status: "contested", candidates: topFacts };
};
