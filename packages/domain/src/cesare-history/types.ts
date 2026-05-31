// packages/domain/src/cesare-history/types.ts
// Spec 51 — input shapes for the DERIVED Cesare history markdown builders.
//
// These are pure data contracts. The builders that consume them
// (`changelog.ts`, `transcript.ts`) are framework-agnostic pure functions: no
// Effect, no Drizzle, no browser/Monaco. The data-loading that gathers these
// shapes from `document_versions` + persisted messages is the Effect loader in
// `features/predictions` (per the Spec 48 boundary rule).

// One word-level diff segment (structurally identical to utils' WordDiffSegment;
// redeclared locally so `domain` keeps zero runtime dependencies).
export interface HistoryDiffSegment {
  readonly op: "eq" | "add" | "del";
  readonly text: string;
}

// The source data for ONE per-edit changelog entry. Derived from the version row
// pair in `document_versions` + the diff markers, never stored as markdown.
export interface EditChangelogSource {
  /** Document type touched, e.g. "soggetto" / "sinossi" / "sceneggiatura". */
  readonly entity: string;
  /** User-facing IT label for the entity, e.g. "Soggetto". */
  readonly entityLabel: string;
  /** The version created by the edit (current after apply). */
  readonly versionId: string;
  /** The version that was active before the edit (null if first version). */
  readonly previousVersionId: string | null;
  /** Optional version number (for human-readable "v3 → v4"). */
  readonly versionNumber: number | null;
  readonly previousVersionNumber: number | null;
  /** Word-level before→after diff segments (already HTML-stripped). */
  readonly diffSegments: ReadonlyArray<HistoryDiffSegment>;
  /** ISO timestamp the version was created. Null when unknown. */
  readonly createdAt: string | null;
}

// One persisted trace step (mirrors the chat reducer TraceStep wire shape).
export interface TranscriptTraceStep {
  readonly kind: "reasoning" | "reading" | "writing" | "tool";
  readonly entityLabel: string | null;
  readonly text: string;
}

// One message in the transcript, with its trace + the edits it produced (links
// into the per-edit changelog above).
export interface TranscriptMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: string | null;
  readonly trace: ReadonlyArray<TranscriptTraceStep>;
  /** Version ids of the edits this turn applied (links to changelog entries). */
  readonly editVersionIds: ReadonlyArray<string>;
}

// The source data for a per-session transcript.
export interface SessionTranscriptSource {
  readonly title: string;
  readonly createdAt: string | null;
  readonly messages: ReadonlyArray<TranscriptMessage>;
  /** The per-edit changelog entries made in this session (resolved + derived). */
  readonly edits: ReadonlyArray<EditChangelogSource>;
}
