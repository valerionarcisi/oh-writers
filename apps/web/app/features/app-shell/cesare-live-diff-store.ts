// apps/web/app/features/app-shell/cesare-live-diff-store.ts
//
// Spec 47e — "Mostra / Nascondi modifiche" as a TRANSIENT FLASH highlight.
//
// The edit is ALWAYS applied: the document already holds the new version. This
// store does NOT model a persistent on/off "diff mode" — it models a one-shot
// flash request per touched document:
//
//   - "Mostra modifiche"   → flash the GREEN additions, then fade out.
//   - "Nascondi modifiche" → flash the previous text with RED removals, then
//                            fade out. The applied document is never changed —
//                            it is a visual peek at "how it was".
//
// Each request carries a monotonically-increasing `nonce`. A per-document
// <CesareLiveDiff/> reads its own entry (with last-value replay so a doc opened
// AFTER the click still flashes) and fires-and-forgets: it paints the flash and
// clears it on a timer keyed by the nonce. Because the nonce only changes on a
// click — never on every render — the consumer's fade effect runs once per
// click and the "Maximum update depth exceeded" loop is removed by construction
// (no persistent reconciled state feeding an effect that re-subscribes each
// render, unlike the 47d on/off model this replaces).
//
// Pure client state — no DB, no React. The chat surface (CesareSheet) writes it
// via `flashLiveDiff`; each per-document <CesareLiveDiff/> reads + subscribes.

export type LiveDiffMode = "mostra" | "nascondi";

export interface LiveDiffSegment {
  readonly op: "eq" | "add" | "del";
  readonly text: string;
}

/** A single flash request for one document. */
export interface LiveDiffFlash {
  readonly documentType: string;
  readonly label: string;
  readonly mode: LiveDiffMode;
  readonly segments: ReadonlyArray<LiveDiffSegment>;
  /** Monotonic id of this flash request — drives the consumer's one-shot timer. */
  readonly nonce: number;
}

export interface LiveDiffState {
  /** Latest flash request per documentType. Replayed to docs opened later. */
  readonly flashes: Readonly<Record<string, LiveDiffFlash>>;
}

const EMPTY_STATE: LiveDiffState = { flashes: {} };

let state: LiveDiffState = EMPTY_STATE;
let nonceCounter = 0;
const listeners = new Set<() => void>();

export function getLiveDiffState(): LiveDiffState {
  return state;
}

interface FlashInput {
  readonly documentType: string;
  readonly label: string;
  readonly segments: ReadonlyArray<LiveDiffSegment>;
}

/**
 * Request a transient flash for the given touched documents. One shared nonce
 * across the batch so a cross-entity edit flashes every open doc in lock-step.
 */
export function flashLiveDiff(
  mode: LiveDiffMode,
  inputs: ReadonlyArray<FlashInput>,
): void {
  if (inputs.length === 0) return;
  nonceCounter += 1;
  const nonce = nonceCounter;
  const flashes: Record<string, LiveDiffFlash> = { ...state.flashes };
  for (const input of inputs) {
    if (!input.documentType) continue;
    flashes[input.documentType] = {
      documentType: input.documentType,
      label: input.label,
      mode,
      segments: input.segments,
      nonce,
    };
  }
  state = { flashes };
  for (const listener of listeners) listener();
}

/** Subscribe to flash requests. Returns an unsubscribe fn. */
export function subscribeLiveDiff(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
