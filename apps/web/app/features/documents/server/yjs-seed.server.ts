// Server-side Yjs snapshot seeding for narrative documents (Spec 72).
//
// A narrative room (`document:{id}`) loads its CRDT from `documents.yjs_state`.
// When that state is NULL the room is "fresh" and relies on the FIRST
// connecting client to seed it from its ProseMirror doc — the same race
// Spec 71 closed for screenplay imports: the editor can observe an empty
// fragment, seed empty, and the autosave then persists the empty state OVER
// the seeded content (BUG-N53; observed live as a clobbered soggetto).
//
// Seeding the state server-side removes the race. The doc is built with the
// plain-text branch of `htmlToDoc` mirrored programmatically (no DOM on the
// server): `\n\n+` splits paragraphs, single `\n` becomes a hard_break, and
// whitespace is collapsed the way ProseMirror's DOMParser would collapse it,
// so the seeded doc serialises back to the same canonical HTML the editor
// derives from `content` (the Spec 61 autosave dirty-check). HTML content
// returns null — parsing it needs a DOM, so those docs keep the client-seed
// path (status quo, and seed fixtures are all plain text).
//
// The schema is always the headings-enabled one: a plain-text build only ever
// emits paragraph/hard_break/text nodes, which are identical in both narrative
// schema flavours, and the superset schema stays valid for every consumer
// (soggetto's free editor is headings-enabled too).

import type { Node as PMNode } from "prosemirror-model";
import { prosemirrorToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import { XML_FRAGMENT } from "../../realtime/lib/yjs-plugins";
import { getNarrativeSchema } from "../lib/narrative-schema";

export const plainTextToNarrativeDoc = (text: string): PMNode => {
  const schema = getNarrativeSchema(true);
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\n+/)
    .map((paragraph) => {
      const children = paragraph
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .flatMap((line, i): PMNode[] => [
          ...(i > 0 ? [schema.node("hard_break")] : []),
          ...(line.length > 0 ? [schema.text(line)] : []),
        ]);
      return schema.node("paragraph", null, children);
    });
  return schema.node("doc", null, paragraphs);
};

/**
 * Build a Yjs CRDT state (as a Buffer ready for the `bytea` column) from a
 * narrative document's plain-text content, encoding the same ProseMirror doc
 * the editor would seed. Returns null for empty content (a blank doc keeps a
 * NULL state — the room seeds empty, which is correct) and for HTML content
 * (needs a DOM to parse; the client seed handles it).
 */
export const yjsStateFromNarrativeContent = (
  content: string,
): Buffer | null => {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("<")) return null;
  const doc = plainTextToNarrativeDoc(trimmed);
  const ydoc = prosemirrorToYDoc(doc, XML_FRAGMENT);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return Buffer.from(update);
};
