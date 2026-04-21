import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

/**
 * Returns the absolute doc position of the N-th heading node (1-based).
 * Null if `index` is out of range (or doc has no headings).
 */
export function findSceneNodePosition(
  doc: PMNode,
  index: number,
): number | null {
  if (index < 1) return null;
  let count = 0;
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (result !== null) return false;
    if (node.type.name === "heading") {
      count += 1;
      if (count === index) {
        result = pos;
        return false;
      }
      return false;
    }
    return true;
  });
  return result;
}

/**
 * Returns the 1-based scene index containing `pos` (i.e. the count of
 * heading nodes whose start <= pos). Null if pos is before the first heading.
 */
export function findSceneIndexAtPos(doc: PMNode, pos: number): number | null {
  let count = 0;
  doc.descendants((node, nodePos) => {
    if (node.type.name === "heading") {
      if (nodePos <= pos) count += 1;
      return false;
    }
    return true;
  });
  return count > 0 ? count : null;
}

/**
 * Scrolls the editor so the scene at `index` (1-based) is visible at the
 * top of the viewport. Uses native scrollIntoView on the DOM node.
 */
export function scrollToScene(view: EditorView, index: number): void {
  const pos = findSceneNodePosition(view.state.doc, index);
  if (pos === null) return;
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
