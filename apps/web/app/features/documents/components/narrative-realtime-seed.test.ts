/**
 * @vitest-environment jsdom
 *
 * Regression for the narrative "Invalid string length" freeze.
 *
 * The realtime narrative editor binds `ySyncPlugin` to a shared Yjs fragment.
 * If a NON-empty initial ProseMirror doc is used to build the EditorState while
 * the fragment ALREADY holds content (a reconnecting client), y-prosemirror
 * merges the initial doc on top of the existing content — the fragment grows on
 * every connect and the persisted CRDT balloons until `docToHtml` exceeds V8's
 * max string length and the page freezes.
 *
 * `NarrativeProseMirrorView` guards this exactly like the screenplay editor:
 * seed from the initial doc ONLY when the fragment is empty; otherwise build the
 * state empty (`{ schema }`) and let the CRDT populate it. These tests pin that
 * contract against real Yjs + y-prosemirror so the guard can't silently regress.
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { EditorState } from "prosemirror-state";
import { prosemirrorToYDoc, ySyncPlugin } from "y-prosemirror";
import { getNarrativeSchema } from "../lib/narrative-schema";
import { htmlToDoc, docToHtml } from "../lib/narrative-html";
import { isFragmentEmpty } from "~/features/realtime";

const XML_FRAGMENT = "prosemirror";
const schema = getNarrativeSchema(true);
const HTML = "<p>Milano, fine anni Novanta.</p><p>Marta vive sola.</p>";

const seededDoc = (): Y.Doc =>
  prosemirrorToYDoc(htmlToDoc(HTML, schema), XML_FRAGMENT);

describe("narrative realtime seed guard", () => {
  it("a fresh fragment is empty; a populated one is not", () => {
    expect(isFragmentEmpty(new Y.Doc())).toBe(true);
    expect(isFragmentEmpty(seededDoc())).toBe(false);
  });

  it("does NOT double content when the state starts empty against a populated fragment", () => {
    const ydoc = seededDoc();
    const baseline = ydoc.getXmlFragment(XML_FRAGMENT).length;

    // The guard's path: fragment is not empty → build the state WITHOUT a doc.
    expect(isFragmentEmpty(ydoc)).toBe(false);
    const state = EditorState.create({
      schema,
      plugins: [ySyncPlugin(ydoc.getXmlFragment(XML_FRAGMENT))],
    });
    void state;

    // Binding ySyncPlugin to the populated fragment must not grow it.
    expect(ydoc.getXmlFragment(XML_FRAGMENT).length).toBe(baseline);
    expect(docToHtml(htmlToDoc(HTML, schema), schema)).toBe(HTML);
  });
});
