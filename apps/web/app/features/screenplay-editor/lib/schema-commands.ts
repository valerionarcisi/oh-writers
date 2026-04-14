import { setBlockType } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
import { schema } from "./schema";
import type { ElementType } from "./fountain-element-detector";

const nodeTypeFor = (element: ElementType) => {
  switch (element) {
    case "scene":
      return schema.nodes.heading;
    case "action":
      return schema.nodes.action;
    case "character":
      return schema.nodes.character;
    case "parenthetical":
      return schema.nodes.parenthetical;
    case "dialogue":
      return schema.nodes.dialogue;
    case "transition":
      return schema.nodes.transition;
  }
};

/**
 * PM command: change the block at the cursor to the given element type.
 *
 * "scene" maps to the `heading` node type (the only scene-level block the
 * writer interacts with directly). The scene wrapper is maintained by the
 * document structure.
 */
export const setElement = (element: ElementType): Command =>
  setBlockType(nodeTypeFor(element));
