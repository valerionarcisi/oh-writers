/**
 * @vitest-environment jsdom
 *
 * Contract tests for `seedFragmentFromDoc` — the ONLY way a first client may
 * seed an empty realtime room (BUG-N54). The seed is a CRDT update whose
 * clientID is a hash of the content, so two clients racing the first open of
 * the same document generate byte-identical ops and the double-apply
 * deduplicates instead of doubling the text.
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Schema, type Node as PMNode } from "prosemirror-model";
import {
  isFragmentEmpty,
  seedFragmentFromDoc,
  XML_FRAGMENT,
} from "./yjs-plugins";
import { yDocToProsemirror } from "y-prosemirror";

// Minimal paragraph schema: the realtime feature is editor-agnostic, so the
// contract is pinned without importing any document feature's schema.
const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "text*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: {},
  },
});

const docFromLines = (lines: readonly string[]): PMNode =>
  schema.node(
    "doc",
    null,
    lines.map((l) => schema.node("paragraph", null, [schema.text(l)])),
  );

const fragmentText = (ydoc: Y.Doc): string =>
  yDocToProsemirror(schema, ydoc).textBetween(
    0,
    yDocToProsemirror(schema, ydoc).content.size,
    "\n",
  );

const LINES = ["Milano, fine anni Novanta.", "Marta vive sola."];
const TEXT = LINES.join("\n");

describe("seedFragmentFromDoc", () => {
  it("seeds an empty room so the fragment round-trips the initial doc", () => {
    const ydoc = new Y.Doc();
    expect(isFragmentEmpty(ydoc)).toBe(true);

    seedFragmentFromDoc(ydoc, docFromLines(LINES));

    expect(isFragmentEmpty(ydoc)).toBe(false);
    expect(fragmentText(ydoc)).toBe(TEXT);
  });

  it("dedupes two first clients racing the same content (no doubled text)", () => {
    // Each "client" seeds its own room copy, then the server merges both
    // states — the y-websocket sync exchange in miniature.
    const a = new Y.Doc();
    const b = new Y.Doc();
    const initialDoc = docFromLines(LINES);
    seedFragmentFromDoc(a, initialDoc);
    seedFragmentFromDoc(b, initialDoc);

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    expect(fragmentText(a)).toBe(TEXT);
    expect(a.getXmlFragment(XML_FRAGMENT).length).toBe(
      b.getXmlFragment(XML_FRAGMENT).length,
    );
  });

  it("merges divergent racing contents as duplication, never same-ID corruption", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    seedFragmentFromDoc(a, docFromLines(["Versione A."]));
    seedFragmentFromDoc(b, docFromLines(["Versione B."]));

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    const merged = fragmentText(a);
    expect(merged).toContain("Versione A.");
    expect(merged).toContain("Versione B.");
  });
});
