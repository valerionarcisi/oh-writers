import * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import type { Plugin } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import {
  redo,
  undo,
  updateYFragment,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
} from "y-prosemirror";
import { keymap } from "prosemirror-keymap";
import { cursorBuilder } from "./cursor-builder";

// The shared Yjs XML fragment key. Server-side CRDT seeding (the per-feature
// `yjs-seed.server.ts` helpers) MUST write under this same key, or the editor
// binds an empty fragment, sees a "fresh" room, and re-seeds over the
// persisted content.
export const XML_FRAGMENT = "prosemirror";

/**
 * The Yjs plugin trio shared by both editors: CRDT sync, remote cursors, and
 * Yjs-native undo/redo. Callers append these in place of `prosemirror-history`
 * when realtime is on (history and ySyncPlugin are incompatible — Yjs owns the
 * undo stack so concurrent edits don't corrupt it).
 */
export const buildYjsPlugins = (
  ydoc: Y.Doc,
  provider: WebsocketProvider,
): Plugin[] => [
  ySyncPlugin(ydoc.getXmlFragment(XML_FRAGMENT)),
  yCursorPlugin(provider.awareness, { cursorBuilder }),
  yUndoPlugin(),
  keymap({
    "Mod-z": undo,
    "Mod-y": redo,
    "Mod-Shift-z": redo,
  }),
];

/** True when the shared Yjs fragment has no content yet (a fresh room to seed). */
export const isFragmentEmpty = (ydoc: Y.Doc): boolean =>
  ydoc.getXmlFragment(XML_FRAGMENT).length === 0;

/**
 * Seed a genuinely-empty room from an initial ProseMirror doc by merging a
 * CRDT update into the shared fragment. This is the ONLY way to seed: passing
 * `doc: initialDoc` to `EditorState` does not — y-prosemirror renders the
 * fragment over the editor on bind (`_forceRerender`), so an empty fragment
 * WIPES the initial doc and the wipe leaks into onChange → autosave (the
 * BUG-N54 clobber).
 *
 * The seeding doc's clientID is a HASH of the content, so two clients racing
 * the first open of the same document generate byte-identical ops and the
 * double-apply deduplicates (random clientIDs would keep BOTH copies).
 * Divergent contents hash to different clientIDs and merge as duplication,
 * never as same-ID corruption.
 */
export const seedFragmentFromDoc = (ydoc: Y.Doc, initialDoc: PMNode): void => {
  const json = JSON.stringify(initialDoc.toJSON());
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash ^ json.charCodeAt(i)) * 0x01000193) >>> 0;
  }
  const seedDoc = new Y.Doc();
  seedDoc.clientID = hash;
  const fragment = seedDoc.getXmlFragment(XML_FRAGMENT);
  seedDoc.transact(() => {
    updateYFragment(seedDoc, fragment, initialDoc, new Map());
  });
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seedDoc));
  seedDoc.destroy();
};
