// apps/web/app/features/app-shell/cesare-live-diff-store.ts
//
// Spec 47d — durable "Mostra modifiche" state for the inline word highlight.
//
// "Mostra modifiche" arms a green word highlight on EVERY document a Cesare
// edit touched, keyed by documentType. The user can then open any of those
// documents and see ITS highlight while diff mode stays armed. Because opening
// a document mounts a fresh <CesareLiveDiff/> AFTER the toggle fired, a one-shot
// DOM event would be missed — so the armed state lives in this module-level
// store with last-value replay: a newly-mounted highlight reads the current
// state on mount, and every instance subscribes to changes. The state survives
// client-side (SPA) navigation; "Nascondi modifiche" clears it.
//
// Pure client state — no DB, no React. The shell broadcaster (CesareSheet)
// writes it; each per-document <CesareLiveDiff/> reads + subscribes.

export interface LiveDiffSegment {
  readonly op: "eq" | "add" | "del";
  readonly text: string;
}

export interface LiveDiffEntry {
  readonly documentType: string;
  readonly label: string;
  readonly segments: ReadonlyArray<LiveDiffSegment>;
}

export interface LiveDiffState {
  /** Whether diff mode is armed (the user clicked "Mostra modifiche"). */
  readonly showing: boolean;
  /** Armed diffs keyed by documentType — one per touched document. */
  readonly diffs: Readonly<Record<string, LiveDiffEntry>>;
}

const EMPTY_STATE: LiveDiffState = { showing: false, diffs: {} };

let state: LiveDiffState = EMPTY_STATE;
const listeners = new Set<() => void>();

export function getLiveDiffState(): LiveDiffState {
  return state;
}

/** Arm the highlight for the given touched documents (or clear it). */
export function setLiveDiffState(next: LiveDiffState): void {
  state = next.showing ? next : EMPTY_STATE;
  for (const listener of listeners) listener();
}

export function clearLiveDiffState(): void {
  setLiveDiffState(EMPTY_STATE);
}

/** Subscribe to armed-state changes. Returns an unsubscribe fn. */
export function subscribeLiveDiff(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
