import { useRef } from "react";
import type { ConnectedRealtime } from "../lib/build-realtime";
import { isRealtimeEnabled } from "../lib/provider";
import type { RealtimeRoom } from "./useYjsRoom";

/**
 * Latch the `{ ydoc, provider }` an editor binds `ySyncPlugin` against.
 *
 * The room may only be adopted once it is connected AND synced (the BUG-N54
 * load contract: mounting earlier would seed the CRDT while the server state
 * is still in flight). But once adopted it must STAY adopted: the editors key
 * their ProseMirror view on the realtime object, so deriving it from the live
 * status would rebuild the view — losing focus and keystrokes — on every
 * connection flap (BUG-N57). After a post-sync drop the provider keeps
 * retrying on the same doc and Yjs buffers edits offline, so holding the
 * latched pair is exactly right.
 *
 * The latch resets when the underlying `ydoc` instance changes (the room was
 * closed and reopened — document or version switch), so a NEW room must again
 * reach `synced` before it is adopted.
 */
export const useLatchedRealtime = (
  room: RealtimeRoom,
): ConnectedRealtime | null => {
  const latchedRef = useRef<ConnectedRealtime | null>(null);
  if (latchedRef.current && latchedRef.current.ydoc !== room.ydoc) {
    latchedRef.current = null;
  }
  if (
    !latchedRef.current &&
    room.status === "connected" &&
    room.synced &&
    room.ydoc &&
    room.provider
  ) {
    latchedRef.current = { ydoc: room.ydoc, provider: room.provider };
  }
  return latchedRef.current;
};

export interface RealtimeEditorGate {
  /** Pass to the ProseMirror view. Non-null from the first sync on. */
  realtime: ConnectedRealtime | null;
  /** True only BEFORE the editor has mounted for this `resetKey`, while the
   *  room is still resolving — render the loading skeleton. Once an editor has
   *  mounted (realtime after `synced`, or the HTTP fallback after a terminal
   *  `offline`) this never flips back to true: a mounted editor is never
   *  swapped for a skeleton (BUG-N57 remount loop). */
  awaitingFirstSync: boolean;
}

interface RealtimeEditorGateOptions {
  /** Whether this editor wants realtime at all (e.g. `canEdit`). */
  enabled: boolean;
  /** Identity of the edited entity (document id). Changing it re-arms the
   *  first-mount skeleton so a NEW document still honours the N54 contract. */
  resetKey: string;
}

/**
 * Single gate for "which editor do I render?" on realtime-backed documents:
 *
 * - `awaitingFirstSync` → skeleton (first load only, while the room resolves);
 * - `realtime` non-null → realtime editor (latched from the first sync on);
 * - otherwise → HTTP-fallback editor.
 */
export const useRealtimeEditorGate = (
  room: RealtimeRoom,
  { enabled, resetKey }: RealtimeEditorGateOptions,
): RealtimeEditorGate => {
  const realtime = useLatchedRealtime(room);

  // The room epoch is part of the reset key: a reseed eviction (BUG-N72 /
  // #35) bumps it and rebuilds the room with a fresh Y.Doc — the content
  // changed wholesale server-side, so the skeleton re-arms and the stale text
  // never flashes through the HTTP-fallback editor (which could even autosave
  // it back) while the new room syncs.
  const compositeKey = `${resetKey}#${room.epoch}`;
  const keyRef = useRef(compositeKey);
  const mountedOnceRef = useRef(false);
  if (keyRef.current !== compositeKey) {
    keyRef.current = compositeKey;
    mountedOnceRef.current = false;
  }

  // `useYjsRoom` starts in the `disabled` shape and only transitions after the
  // async token fetch, so the gate keys off `isRealtimeEnabled()` (a stable
  // env check) rather than the transient status — otherwise the very first
  // render would mount a non-realtime editor that seeds + emits before the
  // room arrives (the original double-seed). `offline` is the terminal "no
  // room will ever deliver content" answer → mount the HTTP fallback.
  const resolvingRealtime =
    enabled &&
    isRealtimeEnabled() &&
    room.status !== "offline" &&
    realtime === null;

  const awaitingFirstSync = resolvingRealtime && !mountedOnceRef.current;
  if (!awaitingFirstSync) {
    mountedOnceRef.current = true;
  }

  return { realtime, awaitingFirstSync };
};
