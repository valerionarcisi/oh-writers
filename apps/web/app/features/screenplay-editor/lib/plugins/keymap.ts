import { keymap } from "prosemirror-keymap";
import { splitBlock } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
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
 */
const elementForNode = (typeName: string): ElementType => {
  switch (typeName) {
    case "heading":
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

/**
 * Tab — cycle the current block to the next element type.
 */
const tabCommand: Command = (state, dispatch, view) => {
  const { $from } = state.selection;
  const blockType = $from.parent.type;
  const current = elementForNode(blockType.name);
  const next = nextElementOnTab(current);
  return setElement(next)(state, dispatch, view);
};

/**
 * Enter — split the block and set the new block's type according to the
 * "next element on Enter" matrix.
 *
 * Strategy:
 *   1. Split the block (standard PM command)
 *   2. Change the resulting new block's type to the matrix result
 */
const enterCommand: Command = (state, dispatch, view) => {
  const { $from } = state.selection;
  const current = elementForNode($from.parent.type.name);
  const next = nextElementOnEnter(current);

  if (!dispatch) {
    // Dry run — check feasibility
    return splitBlock(state, undefined, view);
  }

  // Collect the dispatch calls from both sub-commands
  let newState = state;
  splitBlock(newState, (tr) => {
    newState = newState.apply(tr);
  });

  // Now change the new block type
  const nextNodeType = schema.nodes[next === "scene" ? "heading" : next];
  if (!nextNodeType) {
    dispatch(state.tr);
    return true;
  }

  const tr = newState.tr.setBlockType(
    newState.selection.from,
    newState.selection.to,
    nextNodeType,
  );

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
  "Mod-Shift-f": focusModeCommand,

  // Force element — Alt + letter (same as Spec 05e)
  "Alt-s": setElement("scene"),
  "Alt-a": setElement("action"),
  "Alt-c": setElement("character"),
  "Alt-d": setElement("dialogue"),
  "Alt-p": setElement("parenthetical"),
  "Alt-t": setElement("transition"),
});
