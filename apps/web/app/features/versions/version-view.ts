// The shared, editor-agnostic UI contract for the master→detail Versions surface
// (Spec 66). Both document kinds — narrative documents and the screenplay — map
// their version rows into this single shape so ONE drawer renders both. It is a
// plain serializable shape (ISO strings, no Date objects, no branded ids) so it
// crosses the createServerFn boundary cleanly and the drawer never depends on
// either editor's internals.
//
// `pageCount` is screenplay-only (narrative documents have no pages) — hence
// optional. `draftColor` / `draftDate` are shared (the narrative columns landed in
// migration 0037).

import type { DraftRevisionColor } from "@oh-writers/domain";

export interface VersionView {
  readonly id: string;
  readonly number: number;
  readonly label: string | null;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** The version's full document content (HTML/plain for narrative, PM JSON for screenplay). */
  readonly content: string;
  /** Stable per-version identifier dot, Notion-style. `null` = un-coloured. */
  readonly draftColor: DraftRevisionColor | null;
  /** Optional YYYY-MM-DD draft date. `null` = un-dated. */
  readonly draftDate: string | null;
  /** Screenplay-only page count; absent for narrative versions. */
  readonly pageCount?: number;
  /** Spec 76 — the version's role. `checkpoint`/`working` let the list collapse a
   *  session's working rows under their checkpoint; `manual` is a user-meaningful
   *  row shown on its own. Screenplay rows are always `manual` (separate store). */
  readonly kind: "manual" | "checkpoint" | "working";
  /** Spec 76 — the Cesare session a checkpoint/working row belongs to, so working
   *  rows group under the right checkpoint. `null` for manual/screenplay rows. */
  readonly cesareSessionId: string | null;
}

/** A narrative `document_versions` row, as returned by the canonical versions server. */
interface NarrativeVersionRow {
  readonly id: string;
  readonly number: number;
  readonly label: string | null;
  readonly content: string;
  readonly draftColor: string | null;
  readonly draftDate: string | null;
  readonly createdAt: string | Date;
  // The DB column is plain text; narrowed to the known kinds in the mapper.
  readonly kind?: string;
  readonly cesareSessionId?: string | null;
}

/** A screenplay `screenplay_versions` row (VersionView from screenplay-versions.schema). */
interface ScreenplayVersionRow {
  readonly id: string;
  readonly number: number;
  readonly label: string | null;
  readonly content: string;
  readonly draftColor: string | null;
  readonly draftDate: string | null;
  readonly pageCount: number;
  readonly createdAt: string | Date;
}

const toIso = (value: string | Date): string =>
  typeof value === "string" ? value : value.toISOString();

const asColor = (value: string | null): DraftRevisionColor | null =>
  (value as DraftRevisionColor | null) ?? null;

const asKind = (
  value: string | undefined,
): "manual" | "checkpoint" | "working" =>
  value === "checkpoint" || value === "working" ? value : "manual";

export const narrativeToVersionView = (
  row: NarrativeVersionRow,
): VersionView => ({
  id: row.id,
  number: row.number,
  label: row.label,
  createdAt: toIso(row.createdAt),
  content: row.content,
  draftColor: asColor(row.draftColor),
  draftDate: row.draftDate,
  kind: asKind(row.kind),
  cesareSessionId: row.cesareSessionId ?? null,
});

export const screenplayToVersionView = (
  row: ScreenplayVersionRow,
): VersionView => ({
  id: row.id,
  number: row.number,
  label: row.label,
  createdAt: toIso(row.createdAt),
  content: row.content,
  draftColor: asColor(row.draftColor),
  draftDate: row.draftDate,
  pageCount: row.pageCount,
  // The screenplay has its own version store with no checkpoint model; every row
  // is a user-meaningful entry shown on its own.
  kind: "manual",
  cesareSessionId: null,
});
