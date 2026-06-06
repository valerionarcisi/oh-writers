// apps/web/app/features/app-shell/cesare-live-edit-store.ts
//
// The stack of recent live Cesare edits, per documentType, for the current
// browser session. Drives the entity-page card stack (Spec 63): when the open
// document's editor is in front of the writer, agentic edits are shown by an
// in-editor card stack — NOT a split-preview that would duplicate the document.
//
// One entry per Cesare TURN (prose docs). Each entry carries the pre-turn version
// id so "↩ Annulla" restores the document to the state BEFORE the turn began.
//
// Browser-session memory (a singleton): survives client-side routing (so the bell
// can carry the writer to the entity and find the card waiting) but dies on a tab
// reload. The durable history is the Versions surface. Pure client state, no React.

export interface LiveEditSegment {
  readonly op: "eq" | "add" | "del";
  readonly text: string;
}

/** One live Cesare edit (one turn) on a document. */
export interface LiveEdit {
  readonly id: string;
  readonly documentType: string;
  /** Human label for the entity ("Soggetto", "Logline", …). */
  readonly label: string;
  /** Word-level segments (before→after) — classify surgical vs rewrite + drive the
   *  in-editor underline / the clean final text. */
  readonly segments: ReadonlyArray<LiveEditSegment>;
  /** Cesare's "Cosa cambia" bullet summary (already distilled). */
  readonly summary: string;
  /** Version active BEFORE the turn began — restored by "↩ Annulla". Null when no
   *  pre-turn snapshot was captured (then Annulla is unavailable). */
  readonly previousVersionId: string | null;
  /** Creation order, newest first in the stack. */
  readonly at: number;
}

export interface LiveEditState {
  /** Stack of edits per documentType, newest LAST. */
  readonly stacks: Readonly<Record<string, ReadonlyArray<LiveEdit>>>;
}

const EMPTY_STATE: LiveEditState = { stacks: {} };

let state: LiveEditState = EMPTY_STATE;
let idCounter = 0;
const listeners = new Set<() => void>();

// ─── Pre-turn version snapshot (for ↩ Annulla) ──────────────────────────────
// The open entity's editor reports its CURRENT version id here; when a Cesare
// turn lands an edit on that documentType, we pair it with the snapshot taken
// BEFORE the turn (option A) so Annulla restores the pre-turn state, independent
// of how many intermediate versions Cesare made mid-turn. A plain map, not part
// of the reactive state (it's read at publish time, never rendered).
const preTurnVersionByDocType = new Map<string, string | null>();

/** The open editor reports its current version id for a document type, so a
 *  later edit can capture the pre-turn snapshot. Call on mount + version change. */
export function reportCurrentVersion(
  documentType: string,
  versionId: string | null,
): void {
  preTurnVersionByDocType.set(documentType, versionId);
}

export function getLiveEditState(): LiveEditState {
  return state;
}

/** The stack for one document, newest LAST. */
export function getLiveEditsFor(documentType: string): ReadonlyArray<LiveEdit> {
  return state.stacks[documentType] ?? [];
}

export interface PublishLiveEditInput {
  readonly documentType: string;
  readonly label: string;
  readonly segments: ReadonlyArray<LiveEditSegment>;
  readonly summary: string;
  readonly previousVersionId: string | null;
}

/** Push the latest Cesare edit(s) onto each touched document's stack. */
export function publishLiveEdits(
  inputs: ReadonlyArray<PublishLiveEditInput>,
): void {
  if (inputs.length === 0) return;
  const at = Date.now();
  const stacks: Record<string, ReadonlyArray<LiveEdit>> = { ...state.stacks };
  for (const input of inputs) {
    if (!input.documentType) continue;
    idCounter += 1;
    // Pre-turn snapshot (Spec 63): prefer the version the open editor reported
    // BEFORE this turn (A); fall back to the marker's previous_version_id (B) when
    // the editor was not open (e.g. edit made from a chat session).
    const previousVersionId = preTurnVersionByDocType.has(input.documentType)
      ? (preTurnVersionByDocType.get(input.documentType) ?? null)
      : input.previousVersionId;
    const entry: LiveEdit = {
      ...input,
      previousVersionId,
      id: `live-edit-${idCounter}`,
      at,
    };
    const prev = stacks[input.documentType] ?? [];
    stacks[input.documentType] = [...prev, entry];
    // The new version becomes the pre-turn snapshot for the NEXT turn.
    preTurnVersionByDocType.delete(input.documentType);
  }
  state = { stacks };
  for (const listener of listeners) listener();
}

/** Remove one edit from its document's stack (the writer saw / undid it). */
export function dismissLiveEdit(documentType: string, id: string): void {
  const prev = state.stacks[documentType];
  if (!prev) return;
  const next = prev.filter((e) => e.id !== id);
  const stacks = { ...state.stacks };
  if (next.length === 0) delete stacks[documentType];
  else stacks[documentType] = next;
  state = { stacks };
  for (const listener of listeners) listener();
}

/** Clear the whole stack for one document. */
export function clearLiveEdits(documentType: string): void {
  if (!state.stacks[documentType]) return;
  const stacks = { ...state.stacks };
  delete stacks[documentType];
  state = { stacks };
  for (const listener of listeners) listener();
}

/** Subscribe to stack changes. Returns an unsubscribe fn. */
export function subscribeLiveEdit(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Dev-only debug hook: lets us mock a live-edit stack from the browser console
// without round-tripping the AI (e.g. `__ohWritersLiveEdits([...])`). Stripped in
// production builds (import.meta.env.DEV is false). No effect on the live path.
if (
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV
) {
  (window as unknown as Record<string, unknown>)["__ohWritersLiveEdits"] =
    publishLiveEdits;
}
