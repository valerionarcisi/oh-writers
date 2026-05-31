// packages/domain/src/cesare-history/transcript.ts
// Spec 51 (step 3) — per-session transcript markdown. PURE, framework-agnostic.
//
// DERIVED VIEW: given the persisted messages (+ their step trace + the edit
// version ids) and the resolved per-edit changelog entries, render the readable
// "what Cesare and I did this session" document. Conversation + inline trace +
// links to the per-edit changelog. No raw HTML; regenerable from source.
import { buildEditChangelogMarkdown } from "./changelog.js";
import type {
  EditChangelogSource,
  SessionTranscriptSource,
  TranscriptMessage,
  TranscriptTraceStep,
} from "./types.js";

const roleLabel = (role: "user" | "assistant"): string =>
  role === "user" ? "Tu" : "Cesare";

const traceStepLine = (step: TranscriptTraceStep): string => {
  switch (step.kind) {
    case "reading":
      return `  - Legge: ${step.entityLabel ?? step.text}`;
    case "writing":
      return `  - Scrive: ${step.entityLabel ?? step.text}`;
    case "reasoning":
      return `  - Ragiona: ${step.text}`;
    case "tool":
      return `  - Strumento: ${step.text}`;
  }
};

// A stable token derived from the version id (always unique). It is embedded
// VISIBLY in the edit's heading text, and the per-message link targets the
// GitHub-style auto-slug of that heading — so deep-linking works with PURE
// markdown, no raw HTML anchor.
const editToken = (versionId: string): string =>
  `edit-${versionId.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;

// The transcript-local changelog heading for an edit: entity label + the token.
const editHeadingText = (edit: EditChangelogSource): string =>
  `${edit.entityLabel} (${editToken(edit.versionId)})`;

// GitHub-style heading-id slug: lowercase, drop non-word chars, spaces→dashes.
// Applied to {@link editHeadingText} so a `[label](#slug)` link resolves.
const headingSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-");

const editLinkTarget = (edit: EditChangelogSource): string =>
  headingSlug(editHeadingText(edit));

const renderMessage = (
  message: TranscriptMessage,
  editsByVersionId: ReadonlyMap<string, EditChangelogSource>,
): string => {
  const lines: string[] = [];
  const when = message.createdAt !== null ? ` _(${message.createdAt})_` : "";
  lines.push(`**${roleLabel(message.role)}**${when}`);
  lines.push("");
  lines.push(message.content.trim() === "" ? "_(vuoto)_" : message.content);

  if (message.trace.length > 0) {
    lines.push("");
    lines.push("- Passaggi:");
    for (const step of message.trace) lines.push(traceStepLine(step));
  }

  const links = message.editVersionIds
    .filter((id) => editsByVersionId.has(id))
    .map((id) => {
      const edit = editsByVersionId.get(id)!;
      return `  - [${edit.entityLabel}](#${editLinkTarget(edit)})`;
    });
  if (links.length > 0) {
    lines.push("");
    lines.push("- Modifiche applicate:");
    lines.push(...links);
  }

  return lines.join("\n");
};

const renderEditSection = (edit: EditChangelogSource): string =>
  // The token-bearing heading makes the per-message `[label](#slug)` deep-link
  // resolve against the GitHub-style auto-slug — no raw HTML anchor needed.
  buildEditChangelogMarkdown(edit, editHeadingText(edit));

/**
 * Render a full session transcript markdown. Stable output for stable input.
 *
 * Shape:
 *   # Sessione: {title}
 *   _Creata: {iso}_
 *
 *   ## Conversazione
 *   {messages…}
 *
 *   ## Modifiche
 *   {edit changelog entries with anchors}
 */
export const buildSessionTranscriptMarkdown = (
  source: SessionTranscriptSource,
): string => {
  const editsByVersionId = new Map<string, EditChangelogSource>(
    source.edits.map((e) => [e.versionId, e]),
  );

  const out: string[] = [`# Sessione: ${source.title}`];
  if (source.createdAt !== null) out.push(`_Creata: ${source.createdAt}_`);

  out.push("## Conversazione");
  if (source.messages.length === 0) {
    out.push("_(nessun messaggio)_");
  } else {
    out.push(
      source.messages
        .map((m) => renderMessage(m, editsByVersionId))
        .join("\n\n---\n\n"),
    );
  }

  out.push("## Modifiche");
  if (source.edits.length === 0) {
    out.push("_(nessuna modifica registrata)_");
  } else {
    out.push(source.edits.map(renderEditSection).join("\n\n"));
  }

  return out.join("\n\n");
};
