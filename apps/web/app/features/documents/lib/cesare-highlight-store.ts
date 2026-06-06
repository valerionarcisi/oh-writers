// apps/web/app/features/documents/lib/cesare-highlight-store.ts
//
// Spec 63 — "Mostra cosa è cambiato" underlines the changed text INSIDE the real
// document prose (a ProseMirror decoration), not an overlay panel and not the
// split. This singleton holds, per documentType, the set of added text fragments
// the editor should underline. The entity-page banner arms it on "Mostra" and
// clears it on toggle-off / Annulla; the editor's decoration plugin reads it.
//
// Browser-session only, no React, no DB — a transient view concern keyed by
// documentType so each open editor underlines its own document's change.

export interface HighlightState {
  /** Added text fragments to underline, per documentType. Empty/absent = none. */
  readonly fragments: Readonly<Record<string, ReadonlyArray<string>>>;
}

const EMPTY: HighlightState = { fragments: {} };

let state: HighlightState = EMPTY;
const listeners = new Set<() => void>();

export function getHighlightState(): HighlightState {
  return state;
}

export function getHighlightFragments(
  documentType: string,
): ReadonlyArray<string> {
  return state.fragments[documentType] ?? [];
}

/** Underline these added fragments on the given document. Empty clears it. */
export function setHighlight(
  documentType: string,
  fragments: ReadonlyArray<string>,
): void {
  if (!documentType) return;
  const next = fragments.filter((f) => f.trim().length > 0);
  const fragmentsByType = { ...state.fragments };
  if (next.length === 0) delete fragmentsByType[documentType];
  else fragmentsByType[documentType] = next;
  state = { fragments: fragmentsByType };
  for (const listener of listeners) listener();
}

export function clearHighlight(documentType: string): void {
  if (!state.fragments[documentType]) return;
  const fragmentsByType = { ...state.fragments };
  delete fragmentsByType[documentType];
  state = { fragments: fragmentsByType };
  for (const listener of listeners) listener();
}

export function subscribeHighlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
