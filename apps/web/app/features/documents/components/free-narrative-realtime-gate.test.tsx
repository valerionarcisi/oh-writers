/**
 * @vitest-environment jsdom
 *
 * Regression for the soggetto realtime clobber (BUG-N53, narrative variant).
 *
 * FreeNarrativeEditor used to mount the ProseMirror view as soon as the room
 * reported `connected` — before the first SYNC. The view then saw an empty
 * local fragment, seeded it from its (possibly empty) initial doc, and when
 * the server state arrived y-prosemirror's editor→fragment diff DELETED the
 * server content (the live soggetto lost the user's text). Two contracts pin
 * the fix:
 *
 * 1. connected-but-not-synced renders a skeleton, never a live editor;
 *    synced renders the editor (FreeNarrativeEditor gate).
 * 2. an external `value` that would EMPTY a populated realtime doc is blocked
 *    and the editor's real content is pushed back up (NarrativeProseMirrorView
 *    guard) — the route-driven variant of the same clobber (stale/empty
 *    version row served over a populated CRDT).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { prosemirrorToYDoc } from "y-prosemirror";
import type { WebsocketProvider } from "y-websocket";
import { FreeNarrativeEditor } from "./FreeNarrativeEditor";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
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

describe("FreeNarrativeEditor realtime gate", () => {
  it("holds a skeleton while connected but not yet synced", () => {
    roomState.status = "connected";
    roomState.synced = false;
    roomState.ydoc = new Y.Doc();
    roomState.provider = { awareness: new Awareness(roomState.ydoc) };

    const { queryByTestId, container } = render(
      <LocaleProvider locale="it">
        <FreeNarrativeEditor
          content={HTML}
          onChange={() => {}}
          canEdit={true}
          documentId="doc-1"
        />
      </LocaleProvider>,
    );
    expect(queryByTestId("rich-text-editor")).toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("mounts the editor once the room has synced", () => {
    const { ydoc, provider } = populatedRealtime();
    roomState.status = "connected";
    roomState.synced = true;
    roomState.ydoc = ydoc;
    roomState.provider = provider;

    const { queryByTestId } = render(
      <LocaleProvider locale="it">
        <FreeNarrativeEditor
          content={HTML}
          onChange={() => {}}
          canEdit={true}
          documentId="doc-1"
        />
      </LocaleProvider>,
    );
    expect(queryByTestId("rich-text-editor")).not.toBeNull();
  });
});

describe("NarrativeProseMirrorView first-client seeding", () => {
  it("seeds a genuinely-empty fragment from the initial value instead of wiping it", () => {
    const ydoc = new Y.Doc();
    const provider = {
      awareness: new Awareness(ydoc),
    } as unknown as WebsocketProvider;
    const onChange = vi.fn();

    render(
      <NarrativeProseMirrorView
        value={HTML}
        onChange={onChange}
        enableHeadings={true}
        realtime={{ ydoc, provider }}
      />,
    );

    // The shared fragment received the initial content (merged as a CRDT
    // update) and the editor never emitted an empty doc: `doc: initialDoc`
    // would NOT survive — y-prosemirror renders the fragment over the editor
    // on bind, so an empty fragment wipes it (the BUG-N53 clobber path).
    const fragment = ydoc.getXmlFragment("prosemirror");
    expect(fragment.length).toBeGreaterThan(0);
    expect(fragment.toString()).toContain("Milano");
    const emitted = onChange.mock.calls.map((c) => c[0] as string);
    expect(emitted.every((html) => html.length > 0)).toBe(true);
  });
});

describe("NarrativeProseMirrorView empty-value watchdog", () => {
  it("applies an authoritative empty external value (blank-version flows) but logs the N54 clobber signature", () => {
    const { ydoc, provider } = populatedRealtime();
    const onChange = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rerender } = render(
      <NarrativeProseMirrorView
        value={HTML}
        onChange={onChange}
        enableHeadings={true}
        realtime={{ ydoc, provider }}
      />,
    );

    const fragment = ydoc.getXmlFragment("prosemirror");
    const populatedLength = fragment.length;
    expect(populatedLength).toBeGreaterThan(0);

    // A non-empty change first, so the one-shot `justMounted` adoption is
    // consumed and the guard (not the mount baseline) is what's under test.
    rerender(
      <NarrativeProseMirrorView
        value={`${HTML}<p>extra</p>`}
        onChange={onChange}
        enableHeadings={true}
        realtime={{ ydoc, provider }}
      />,
    );

    onChange.mockClear();
    rerender(
      <NarrativeProseMirrorView
        value=""
        onChange={onChange}
        enableHeadings={true}
        realtime={{ ydoc, provider }}
      />,
    );

    // The empty replacement is authoritative ("riparti da zero" / switching
    // to a blank version flows through this prop) so it APPLIES — the doc
    // empties and the change propagates into the shared fragment — but the
    // N54 clobber signature is logged for observability.
    const emptied = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emptied).toBe("");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("emptied a populated realtime doc"),
      expect.anything(),
    );
    warn.mockRestore();
  });
});
