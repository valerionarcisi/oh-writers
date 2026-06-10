// Server-side Yjs snapshot seeding for screenplay versions.
//
// A version-scoped realtime room loads its CRDT from the version row's
// `yjs_snapshot`. When that snapshot is NULL the room is "fresh" and relies on
// the FIRST connecting client to seed it from its ProseMirror doc. That client
// seed races the editor remount + autosave: on an import-as-active-version the
// editor can remount, observe an empty fragment, seed empty, and the autosave
// then persists the empty state OVER the freshly imported content (data loss).
//
// Seeding the snapshot server-side at version-creation time removes the race:
// the room loads already-populated, the client sees a non-empty fragment so it
// never re-seeds, and the autosave's canonical dirty-check matches (no clobber).
//
// ProseMirror + Yjs are heavy and browser-leaning but legal here (apps/web
// server code, not a shared package).

import { prosemirrorToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import { XML_FRAGMENT } from "../../realtime/lib/yjs-plugins";
import { fountainToDoc } from "../lib/fountain-to-doc";

/**
 * Build a Yjs CRDT snapshot (as a Buffer ready for the `bytea` column) from a
 * Fountain string, encoding the same ProseMirror doc the editor would render.
 * Returns null for empty content so a blank version keeps a NULL snapshot
 * (the room seeds empty, which is correct for a blank version).
 */
export const yjsSnapshotFromFountain = (content: string): Buffer | null => {
  if (content.trim().length === 0) return null;
  const doc = fountainToDoc(content);
  const ydoc = prosemirrorToYDoc(doc, XML_FRAGMENT);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return Buffer.from(update);
};
