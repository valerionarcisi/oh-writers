/**
 * @vitest-environment jsdom
 *
 * Regression for BUG-N57 — the skeleton↔editor remount loop.
 *
 * A reachable-but-misbehaving ws-server (accepts the socket, never syncs,
 * drops, retries) used to make the room status oscillate, and the editors'
 * `awaiting sync ? <Skeleton/> : <Editor/>` ternary remounted the ProseMirror
 * view every ~100ms — focus died, keystrokes landed nowhere, and the autosave
 * persisted truncated text. Three contracts pin the fix:
 *
 * 1. once the realtime editor has mounted (after the first sync), later
 *    status oscillation (connected↔offline↔connecting) never unmounts or
 *    rebuilds it — the latched room rides the provider's own reconnects;
 * 2. a room that latches terminal `offline` (repeated connect-without-sync)
 *    renders the HTTP editor — and that editor is never swapped back to a
 *    skeleton even if a status starts resolving again;
 * 3. the happy path is unchanged: skeleton while connecting/syncing on FIRST
 *    load, realtime editor after `synced` (BUG-N54 contract).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { prosemirrorToYDoc } from "y-prosemirror";
import type { WebsocketProvider } from "y-websocket";
import { FreeNarrativeEditor } from "./FreeNarrativeEditor";
import { getNarrativeSchema } from "../lib/narrative-schema";
import { htmlToDoc } from "../lib/narrative-html";
import { LocaleProvider } from "~/features/i18n";

const roomState = {
  status: "connected" as string,
  synced: false,
  ydoc: null as Y.Doc | null,
  provider: null as unknown,
  peers: [],
};

vi.mock("~/features/realtime", async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    isRealtimeEnabled: () => true,
    useYjsRoom: () => roomState,
    PresenceIndicator: () => null,
  };
});

// The real `useRealtimeEditorGate` (re-exported above via `importOriginal`)
// reads `isRealtimeEnabled` from the provider lib directly — stub it there too
// so the gate believes realtime is configured.
vi.mock("~/features/realtime/lib/provider", async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    isRealtimeEnabled: () => true,
  };
});

vi.mock("~/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { id: "u1", name: "Test" } } }),
}));

afterEach(() => cleanup());

const schema = getNarrativeSchema(true);
const HTML = "<p>Milano, fine anni Novanta.</p><p>Marta vive sola.</p>";

const populatedRealtime = () => {
  const ydoc = prosemirrorToYDoc(htmlToDoc(HTML, schema), "prosemirror");
  const provider = {
    awareness: new Awareness(ydoc),
  } as unknown as WebsocketProvider;
  return { ydoc, provider };
};

const editor = () => (
  <LocaleProvider locale="it">
    <FreeNarrativeEditor
      content={HTML}
      onChange={() => {}}
      canEdit={true}
      documentId="doc-1"
    />
  </LocaleProvider>
);

describe("BUG-N57 — a mounted realtime editor survives status oscillation", () => {
  it("keeps the same ProseMirror view across connected↔offline↔connecting flaps after the first sync", () => {
    const { ydoc, provider } = populatedRealtime();
    roomState.status = "connected";
    roomState.synced = true;
    roomState.ydoc = ydoc;
    roomState.provider = provider;

    const { container, rerender } = render(editor());
    const view = container.querySelector(".ProseMirror");
    expect(view).not.toBeNull();

    for (const status of ["offline", "connected", "connecting", "connected"]) {
      roomState.status = status;
      rerender(editor());
      // Same DOM node — the view was neither swapped for a skeleton nor
      // rebuilt (a rebuilt EditorView would produce a new .ProseMirror node).
      expect(container.querySelector(".ProseMirror")).toBe(view);
      expect(container.querySelector("[aria-busy='true']")).toBeNull();
    }
  });
});

describe("BUG-N57 — terminal offline falls back to the HTTP editor once", () => {
  it("renders the HTTP editor when the room latched offline without ever syncing", () => {
    roomState.status = "offline";
    roomState.synced = false;
    roomState.ydoc = null;
    roomState.provider = null;

    const { container, queryByTestId } = render(editor());
    expect(queryByTestId("rich-text-editor")).not.toBeNull();
    expect(container.querySelector("[aria-busy='true']")).toBeNull();
  });

  it("never swaps the mounted HTTP editor back to a skeleton if a status starts resolving again", () => {
    roomState.status = "offline";
    roomState.synced = false;
    roomState.ydoc = null;
    roomState.provider = null;

    const { container, rerender } = render(editor());
    const view = container.querySelector(".ProseMirror");
    expect(view).not.toBeNull();

    // Belt-and-braces: the hook latches `offline` terminally, but even if a
    // status ever resolved again the mounted editor must not yield to the
    // skeleton (the other half of the remount loop).
    roomState.status = "connecting";
    rerender(editor());
    expect(container.querySelector(".ProseMirror")).toBe(view);
    expect(container.querySelector("[aria-busy='true']")).toBeNull();
  });
});

describe("BUG-N57 — the first-load contract (BUG-N54) is unchanged", () => {
  it("still holds the skeleton while connecting on first load, then mounts realtime on synced", () => {
    roomState.status = "connecting";
    roomState.synced = false;
    roomState.ydoc = null;
    roomState.provider = null;

    const { container, rerender, queryByTestId } = render(editor());
    expect(queryByTestId("rich-text-editor")).toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();

    // connected-but-not-synced keeps the skeleton (no early realtime mount).
    const { ydoc, provider } = populatedRealtime();
    roomState.status = "connected";
    roomState.ydoc = ydoc;
    roomState.provider = provider;
    rerender(editor());
    expect(queryByTestId("rich-text-editor")).toBeNull();

    roomState.synced = true;
    rerender(editor());
    expect(queryByTestId("rich-text-editor")).not.toBeNull();
    expect(container.querySelector(".ProseMirror")).not.toBeNull();
  });
});
