import { keymap } from "prosemirror-keymap";
import { splitBlock } from "prosemirror-commands";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { schema } from "../schema";
import { setElement } from "../schema-commands";
import {
  nextElementOnTab,
  nextElementOnEnter,
} from "../fountain-element-transforms";
import type { ElementType } from "../fountain-element-detector";

/**
 * Map a PM node type name back to an ElementType so we can use the existing
 * transform matrices without duplication.
 *
 * `prefix` and `title` are inline children of `heading` — for matrix
 * purposes they both count as "scene" (the writer is still editing the
 * scene heading, regardless of which slot the caret is in).
 */
const elementForNode = (typeName: string): ElementType => {
  switch (typeName) {
    case "heading":
    case "prefix":
    case "title":
      return "scene";
    case "character":
      return "character";
    case "parenthetical":
      return "parenthetical";
    case "dialogue":
      return "dialogue";
    case "transition":
      return "transition";
    default:
      return "action";
  }
};

// Caret is at offset 0 inside a `title` slot. Used to decide whether
// Backspace should hop to the end of the sibling `prefix` (yes) or
// delete a character inside the title (no).
const isAtTitleStart = (state: EditorState): boolean => {
  const { $from } = state.selection;
  return $from.parent.type.name === "title" && $from.parentOffset === 0;
};

// Jump caret to end of the `prefix` slot that sits directly before the
// current `title`. Returns the new position or null if no prefix sibling.
const positionAtPrefixEnd = (state: EditorState): number | null => {
  const { $from } = state.selection;
  if ($from.parent.type.name !== "title") return null;
  const headingDepth = $from.depth - 1;
  const heading = $from.node(headingDepth);
  if (heading.type.name !== "heading") return null;
  const headingStart = $from.before(headingDepth) + 1;
  const prefix = heading.firstChild;
  if (!prefix || prefix.type.name !== "prefix") return null;
  return headingStart + prefix.nodeSize - 1;
};

// Jump caret to start of the `title` slot that sits directly after the
// current `prefix`. Returns the new position or null if no title sibling.
const positionAtTitleStart = (state: EditorState): number | null => {
  const { $from } = state.selection;
  if ($from.parent.type.name !== "prefix") return null;
  const headingDepth = $from.depth - 1;
  const heading = $from.node(headingDepth);
  if (heading.type.name !== "heading") return null;
  const headingStart = $from.before(headingDepth) + 1;
  const prefixSize = heading.firstChild!.nodeSize;
  // +1 to land inside the title node, past its opening token.
  return headingStart + prefixSize + 1;
};

/**
 * Tab — cycle the current block to the next element type.
 *
 * Special cases:
 * - Tab inside `prefix` hops to start of `title`, consuming the key.
 *   Matches the idiomatic flow: INT. + Tab → ready to type location.
 * - Tab on an empty dialogue node (the typical post-Enter state after
 *   a character cue) converts to a parenthetical pre-filled with "()"
 *   and places the cursor between the parens. Final Draft's author flow.
 */
export const tabCommand: Command = (state, dispatch, view) => {
  const { $from } = state.selection;
  const blockType = $from.parent;

  if (blockType.type.name === "prefix") {
    const pos = positionAtTitleStart(state);
    if (pos === null) return false;
    if (!dispatch) return true;
    const tr = state.tr.setSelection(TextSelection.create(state.doc, pos));
    dispatch(tr);
    return true;
  }

  const current = elementForNode(blockType.type.name);

  if (current === "dialogue" && blockType.textContent.length === 0) {
    const parenType = schema.nodes["parenthetical"];
    if (!parenType) return false;
    if (!dispatch) return true;

    const blockStart = $from.before($from.depth);
    const blockEnd = $from.after($from.depth);
    const newNode = parenType.create(null, [schema.text("()")]);
    const tr = state.tr.replaceRangeWith(blockStart, blockEnd, newNode);
    // Cursor goes between "(" and ")" — offset 1 inside the new node's text.
    const cursorPos = blockStart + 1 + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr);
    return true;
  }

  const next = nextElementOnTab(current);
  return setElement(next)(state, dispatch, view);
};

/**
 * Enter — insert a new block according to the "next element on Enter" matrix.
 *
 * Two strategies depending on the current node type:
 *
 * A) Inside a `heading` (scene heading):
 *    `splitBlock` cannot be used because `heading` is the unique first child
 *    of `scene` — splitting it would produce a second heading, which violates
 *    the schema. Instead we insert a new `action` node at the end of the
 *    heading's parent scene and move the cursor there.
 *
 * B) Inside any body node (action, character, dialogue, …):
 *    `splitBlock` splits the block, then we setBlockType on the new half.
 */
export const enterCommand: Command = (state, dispatch, view) => {
  const { $from } = state.selection;
  const parentNode = $from.parent;
  const parentType = parentNode.type.name;
  const current = elementForNode(parentType);
  const next = nextElementOnEnter(current);

  if (!dispatch) {
    return splitBlock(state, undefined, view);
  }

  // Special case: Enter on an empty dialogue / character / parenthetical
  // converts the block in-place to Action instead of stepping forward in
  // the matrix. "Double-Enter to break out" is standard screenplay-editor
  // muscle memory: Character → Enter (empty dialogue) → Enter → Action.
  const isEmptyBreakoutBlock =
    parentNode.textContent.length === 0 &&
    (parentType === "dialogue" ||
      parentType === "character" ||
      parentType === "parenthetical");
  if (isEmptyBreakoutBlock) {
    const actionType = schema.nodes["action"];
    if (!actionType) return false;
    const blockStart = $from.before($from.depth);
    const tr = state.tr.setNodeMarkup(blockStart, actionType);
    tr.setSelection(TextSelection.near(tr.doc.resolve(blockStart + 1)));
    dispatch(tr);
    return true;
  }

  // Strategy A: caret is somewhere inside the scene heading (either in the
  // prefix or title inline slot) → close the heading and drop an empty
  // action node right after it, within the same scene.
  if (parentType === "prefix" || parentType === "title") {
    // depth-2 is the scene node (heading → prefix/title are depth-1/-2/-3
    // depending on the slot, but the scene is always one level above the
    // heading). Walk up until we find the `scene` node.
    let d = $from.depth;
    while (d > 0 && $from.node(d).type.name !== "scene") d -= 1;
    if (d <= 0) return false;
    const sceneNode = $from.node(d);
    const scenePos = $from.before(d);

    const insertPos = scenePos + 1 + sceneNode.child(0).nodeSize;

    const actionType = schema.nodes["action"];
    if (!actionType) return false;

    const tr = state.tr.insert(insertPos, actionType.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
    dispatch(tr);
    return true;
  }

  // Strategy B: body nodes — split then retype.
  //
  // splitBlock produces a transaction based on `state`. We extend that same
  // transaction with a setNodeMarkup step so we dispatch only once to the view.
  // Dispatching a second transaction built on an intermediate state causes
  // "Applying a mismatched transaction" — hence the single-tr approach.
  const nextNodeType = schema.nodes[next === "scene" ? "heading" : next];
  if (!nextNodeType) return false;

  let splitTr: Transaction | null = null;
  splitBlock(state, (tr) => {
    splitTr = tr;
  });
  if (!splitTr) return false;

  // After splitBlock the selection lands at offset 0 inside the new node.
  // The new node starts at $from.before($from.depth) in the post-split doc.
  // TypeScript loses track of `splitTr` inside the callback — cast to satisfy it.
  const tr = splitTr as Transaction;
  const $after = tr.selection.$from;
  const newBlockPos = $after.before($after.depth);

  tr.setNodeMarkup(newBlockPos, nextNodeType);
  // Place cursor inside the new empty block. `TextSelection.near` snaps forward
  // to the nearest text position — when the new block is empty it jumps into the
  // next sibling's text, losing the cursor. `TextSelection.create` pins the
  // cursor exactly inside the empty block where the writer expects it.
  tr.setSelection(TextSelection.create(tr.doc, newBlockPos + 1));

  dispatch(tr);
  return true;
};

/**
 * Space — inside the `prefix` slot, consumed as a navigation key that
 * hops to the title. Elsewhere it yields (returns false) so PM's default
 * text-input handling runs.
 */
export const spaceCommand: Command = (state, dispatch, view) => {
  const { $from } = state.selection;
  if ($from.parent.type.name !== "prefix") return false;
  const pos = positionAtTitleStart(state);
  if (pos === null) return false;
  if (!dispatch) return true;
  const tr = state.tr.setSelection(TextSelection.create(state.doc, pos));
  dispatch(tr);
  // PM can leave the browser DOM selection behind when hopping across an
  // empty isolating inline node (title). Re-focus so subsequent keystrokes
  // land at the new state selection instead of the prior DOM caret.
  view?.focus();
  return true;
};

/**
 * Backspace at offset 0 of the `title` slot — hop caret to end of the
 * sibling `prefix` with no deletion. `isolating: true` on the two nodes
 * already prevents fusion; this just makes the navigation feel natural.
 */
export const backspaceCommand: Command = (state, dispatch) => {
  if (!isAtTitleStart(state)) return false;
  const pos = positionAtPrefixEnd(state);
  if (pos === null) return false;
  if (!dispatch) return true;
  const tr = state.tr.setSelection(TextSelection.create(state.doc, pos));
  dispatch(tr);
  return true;
};

/**
 * Focus mode toggle — fires a DOM custom event so ScreenplayEditor's React
 * state can respond. Identical to the Monaco approach.
 */
const focusModeCommand: Command = () => {
  window.dispatchEvent(new Event("screenplay:toggleFocusMode"));
  return true;
};

export const fountainKeymap = keymap({
  Tab: tabCommand,
  Enter: enterCommand,
  Space: spaceCommand,
  Backspace: backspaceCommand,
  "Mod-Shift-f": focusModeCommand,

  // Force element — Alt + letter (same as Spec 05e)
  "Alt-s": setElement("scene"),
  "Alt-a": setElement("action"),
  "Alt-c": setElement("character"),
  "Alt-d": setElement("dialogue"),
  "Alt-p": setElement("parenthetical"),
  "Alt-t": setElement("transition"),
});
