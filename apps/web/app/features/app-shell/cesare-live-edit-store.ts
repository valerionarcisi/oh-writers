// apps/web/app/features/app-shell/cesare-live-edit-store.ts
//
// The LATEST live Cesare edit, per documentType, for the current browser session.
// Drives the entity-page "Cesare ha aggiornato …" notice (Spec 78 §A2): when the
// open document's editor is in front of the writer, a single discreet, auto-
// dismissing line confirms the live edit — never a stack, never a pile.
//
// At most ONE entry per documentType: a new Cesare turn REPLACES the previous
// notice rather than appending (Spec 78 §A2 — no stacking). The edit applies LIVE
// behind the chat; the chat result card is the record; true revert lives in the
// Versions SplitDrawer (Spec 47e), not here. Each entry still carries the pre-turn
// version id for diagnostics, but the banner no longer offers an inline undo.
//
// Browser-session memory (a singleton): survives client-side routing (so the bell
// can carry the writer to the entity and find the notice waiting) but dies on a tab
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
  /** Version active BEFORE the turn began. Kept for diagnostics; the banner no
   *  longer offers an inline undo (revert lives in the Versions drawer). Null when
   *  no pre-turn snapshot was captured. */
  readonly previousVersionId: string | null;
  /** Creation timestamp. */
  readonly at: number;
}

export interface LiveEditState {
  /** The single latest edit per documentType (a new turn replaces the previous). */
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

/** The latest edit for one document as a 0-or-1 array (never stacks). */
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

/** Publish the latest Cesare edit per touched document. A new edit REPLACES the
 *  document's previous notice (Spec 78 §A2 — never stacks). When a turn touches the
 *  same document twice, only the last write survives. */
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
    // Replace (not append): at most one notice per document.
    stacks[input.documentType] = [entry];
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
