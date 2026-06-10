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
import {
  isFragmentEmpty,
  seedFragmentFromDoc,
  XML_FRAGMENT,
} from "./yjs-plugins";
import { getNarrativeSchema } from "~/features/documents/lib/narrative-schema";
import { htmlToDoc, docToHtml } from "~/features/documents/lib/narrative-html";
import { yDocToProsemirror } from "y-prosemirror";

const schema = getNarrativeSchema(true);
const HTML = "<p>Milano, fine anni Novanta.</p><p>Marta vive sola.</p>";

const fragmentHtml = (ydoc: Y.Doc): string =>
  docToHtml(yDocToProsemirror(schema, ydoc), schema);

describe("seedFragmentFromDoc", () => {
  it("seeds an empty room so the fragment round-trips the initial doc", () => {
    const ydoc = new Y.Doc();
    expect(isFragmentEmpty(ydoc)).toBe(true);

    seedFragmentFromDoc(ydoc, htmlToDoc(HTML, schema));

    expect(isFragmentEmpty(ydoc)).toBe(false);
    expect(fragmentHtml(ydoc)).toBe(HTML);
  });

  it("dedupes two first clients racing the same content (no doubled text)", () => {
    // Each "client" seeds its own room copy, then the server merges both
    // states — the y-websocket sync exchange in miniature.
    const a = new Y.Doc();
    const b = new Y.Doc();
    const initialDoc = htmlToDoc(HTML, schema);
    seedFragmentFromDoc(a, initialDoc);
    seedFragmentFromDoc(b, initialDoc);

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    expect(fragmentHtml(a)).toBe(HTML);
    expect(a.getXmlFragment(XML_FRAGMENT).length).toBe(
      b.getXmlFragment(XML_FRAGMENT).length,
    );
  });

  it("merges divergent racing contents as duplication, never same-ID corruption", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    seedFragmentFromDoc(a, htmlToDoc("<p>Versione A.</p>", schema));
    seedFragmentFromDoc(b, htmlToDoc("<p>Versione B.</p>", schema));

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    const merged = fragmentHtml(a);
    expect(merged).toContain("Versione A.");
    expect(merged).toContain("Versione B.");
  });
});
