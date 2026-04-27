import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { CHARS_PER_CARTELLA } from "@oh-writers/domain";

export const cartellaMarkerPluginKey = new PluginKey("cartellaMarker");

/**
 * Pure helper — exported for unit testing.
 * Given the total plain-text length of the doc, returns the char offsets
 * where cartella boundaries fall (every CHARS_PER_CARTELLA chars). A boundary
 * is emitted only once the cursor has strictly passed it.
 */
export const computeCartellaOffsets = (
  textLength: number,
): ReadonlyArray<number> => {
  const offsets: number[] = [];
  let cursor = CHARS_PER_CARTELLA;
  while (cursor < textLength) {
    offsets.push(cursor);
    cursor += CHARS_PER_CARTELLA;
  }
  return offsets;
};

/**
 * Maps a flat-text char offset to a ProseMirror document position.
 * Walks text nodes in document order, accumulating their text length.
 * Returns null if the offset exceeds the doc's total text length.
 */
export const flatOffsetToDocPos = (
  doc: PMNode,
  offset: number,
): number | null => {
  let remaining = offset;
  let foundPos: number | null = null;
  doc.descendants((node, pos) => {
    if (foundPos !== null) return false;
    if (node.isText) {
      const len = node.text?.length ?? 0;
      if (remaining <= len) {
        foundPos = pos + remaining;
        return false;
      }
      remaining -= len;
    }
    return true;
  });
  return foundPos;
};

const buildDecorations = (state: EditorState): DecorationSet => {
  const doc = state.doc;
  const totalTextLength = doc.textContent.length;
  const offsets = computeCartellaOffsets(totalTextLength);
  const decos: Decoration[] = [];
  offsets.forEach((offset, idx) => {
    const pos = flatOffsetToDocPos(doc, offset);
    if (pos === null) return;
    const cartellaNumber = idx + 2;
    decos.push(
      Decoration.widget(
        pos,
        () => {
          const el = document.createElement("div");
          el.className = "cartellaMarker";
          el.setAttribute("data-cartella", String(cartellaNumber));
          el.textContent = `— cartella ${cartellaNumber} —`;
          return el;
        },
        { side: -1 },
      ),
    );
  });
  return DecorationSet.create(doc, decos);
};

export const createCartellaMarkerPlugin = () =>
  new Plugin({
    key: cartellaMarkerPluginKey,
    state: {
      init: (_, state) => buildDecorations(state),
      apply: (tr, old, _oldState, newState) =>
        tr.docChanged ? buildDecorations(newState) : old,
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
