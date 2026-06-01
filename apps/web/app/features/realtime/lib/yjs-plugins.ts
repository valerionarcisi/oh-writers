import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import type { Plugin } from "prosemirror-state";
import {
  redo,
  undo,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
} from "y-prosemirror";
import { keymap } from "prosemirror-keymap";
import { cursorBuilder } from "./cursor-builder";

const XML_FRAGMENT = "prosemirror";

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
