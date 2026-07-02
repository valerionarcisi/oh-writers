/**
 * @vitest-environment jsdom
 *
 * BUG-N72 / #35 — the gate must re-arm the first-mount skeleton when the room
 * epoch bumps (a server reseed eviction rebuilt the room with a fresh Y.Doc).
 * Contracts:
 *
 * 1. baseline: a connected+synced room is latched and the skeleton drops;
 * 2. on the reseed render (epoch bumped, room reset to connecting in the SAME
 *    batch — see useYjsRoom.onConnectionClose) the skeleton re-arms: the stale
 *    HTTP-fallback editor must never mount (it would show — and could
 *    autosave — the pre-reseed content);
 * 3. the skeleton holds until the NEW room syncs, then the new pair latches.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { useRealtimeEditorGate } from "./useRealtimeEditorGate";
import type { RealtimeRoom } from "./useYjsRoom";

vi.mock("../lib/provider", () => ({
  isRealtimeEnabled: () => true,
}));

const provider = { fake: true } as unknown as WebsocketProvider;

const connectedRoom = (ydoc: Y.Doc, epoch: number): RealtimeRoom => ({
  ydoc,
  provider,
  status: "connected",
  peers: [],
  synced: true,
  epoch,
});

const reseedingRoom = (epoch: number): RealtimeRoom => ({
  ydoc: null,
  provider: null,
  status: "connecting",
  peers: [],
  synced: false,
  epoch,
});

describe("useRealtimeEditorGate epoch re-arm (BUG-N72 / #35)", () => {
  it("re-arms the skeleton on an epoch bump and latches the NEW room after its sync", () => {
    const oldDoc = new Y.Doc();
    const { result, rerender } = renderHook(
      ({ room }: { room: RealtimeRoom }) =>
        useRealtimeEditorGate(room, { enabled: true, resetKey: "doc-1" }),
      { initialProps: { room: connectedRoom(oldDoc, 0) } },
    );

    expect(result.current.realtime?.ydoc).toBe(oldDoc);
    expect(result.current.awaitingFirstSync).toBe(false);

    // Reseed eviction: epoch bumps and the room resets in the same render.
    rerender({ room: reseedingRoom(1) });
    expect(result.current.realtime).toBeNull();
    expect(result.current.awaitingFirstSync).toBe(true);

    // Still resolving on a later render — the skeleton must hold, not fall
    // through to the HTTP fallback.
    rerender({ room: reseedingRoom(1) });
    expect(result.current.awaitingFirstSync).toBe(true);

    const newDoc = new Y.Doc();
    rerender({ room: connectedRoom(newDoc, 1) });
    expect(result.current.realtime?.ydoc).toBe(newDoc);
    expect(result.current.awaitingFirstSync).toBe(false);
  });

  it("same epoch: post-sync flaps never re-arm the skeleton (BUG-N57 contract)", () => {
    const ydoc = new Y.Doc();
    const { result, rerender } = renderHook(
      ({ room }: { room: RealtimeRoom }) =>
        useRealtimeEditorGate(room, { enabled: true, resetKey: "doc-1" }),
      { initialProps: { room: connectedRoom(ydoc, 0) } },
    );
    expect(result.current.awaitingFirstSync).toBe(false);

    rerender({ room: { ...connectedRoom(ydoc, 0), status: "offline" } });
    expect(result.current.awaitingFirstSync).toBe(false);
    expect(result.current.realtime?.ydoc).toBe(ydoc);
  });
});
