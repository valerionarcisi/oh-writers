import { setBlockType } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { schema } from "./schema";
import type { ElementType } from "./fountain-element-detector";
import { sceneNumberForInsertion } from "@oh-writers/domain";
import type { EditorState } from "prosemirror-state";

// Walk the doc and collect every numbered heading's scene_number in doc order.
// Synthetic pre-heading scenes (scene_number === "") are excluded — they are
// not part of the scene sequence industry writers see.
const collectNumberedSceneNumbers = (state: EditorState): string[] => {
  const numbers: string[] = [];
  state.doc.descendants((node) => {
    if (node.type.name !== "heading") return true;
    const n = (node.attrs.scene_number as string) ?? "";
    if (n !== "") numbers.push(n);
    return false;
  });
  return numbers;
};

/**
 * PM command: change the block at the cursor to the given element type.
 *
 * All body types (action, character, dialogue, parenthetical, transition)
 * are handled by `setBlockType` — they share the same parent (`scene`) and
 * can be freely converted.
 *
 * "scene" is the exception: `heading` is the first child of a `scene` node
 * and cannot be set via `setBlockType` on a body node. Instead, we lift the
 * current block's text out and wrap it in a new scene node inserted after the
 * current scene.
 */
export const setElement = (element: ElementType): Command => {
  if (element !== "scene") {
    const nodeType =
      element === "action"
        ? schema.nodes.action
        : element === "character"
          ? schema.nodes.character
          : element === "parenthetical"
            ? schema.nodes.parenthetical
            : element === "dialogue"
              ? schema.nodes.dialogue
              : schema.nodes.transition;
    return setBlockType(nodeType);
  }

  // "scene": create a new scene. Two cases per spec 05g:
  //
  // 1. Cursor is already inside a heading → no-op (nothing to promote).
  // 2. Cursor is inside a body block → split the current scene at the block
  //    boundary: everything up to the block stays in the original scene,
  //    the block's text becomes the new scene's `title`, and everything
  //    after the block moves into the new scene's body. This matches the
  //    user expectation that "make this line a scene" inserts the new
  //    scene exactly where the caret is, not at the end of the parent scene.
  return (state, dispatch) => {
    const { $from } = state.selection;
    const blockNode = $from.parent;
    const parentType = blockNode.type.name;

    // Already editing a heading slot: if the heading is non-empty or there
    // is any other content in the doc, there's nothing to do — the writer
    // is already in a scene. But if the doc is a single empty-heading scene
    // (fresh screenplay), "Scene" should focus the prefix so the writer can
    // start typing. We forward by dispatching a no-op selection refresh so
    // the toolbar click restores caret into the prefix slot.
    if (
      parentType === "heading" ||
      parentType === "prefix" ||
      parentType === "title"
    ) {
      // Walk up to scene depth to decide whether this is the fresh-doc case.
      let d = $from.depth;
      while (d > 0 && $from.node(d).type.name !== "scene") d -= 1;
      if (d <= 0) return false;
      const scene = $from.node(d);
      const heading = scene.firstChild;
      const isEmptyHeading =
        !!heading &&
        heading.type.name === "heading" &&
        heading.textContent.length === 0;
      const isOnlyScene = state.doc.childCount === 1;
      if (isEmptyHeading && isOnlyScene) {
        if (!dispatch) return true;
        const sceneStart = $from.before(d);
        const prefixPos = sceneStart + 1 + 1 + 1; // scene_open + heading_open + prefix_open
        const tr = state.tr.setSelection(
          TextSelection.create(state.doc, prefixPos),
        );
        dispatch(tr);
        return true;
      }
      return false;
    }

    // Walk up to the enclosing scene.
    let sceneDepth = $from.depth;
    while (sceneDepth > 0 && $from.node(sceneDepth).type.name !== "scene") {
      sceneDepth -= 1;
    }
    if (sceneDepth <= 0) return false;

    const blockStart = $from.before($from.depth);
    const blockEnd = $from.after($from.depth);
    const sceneStart = $from.before(sceneDepth);
    const sceneEnd = $from.after(sceneDepth);
    const sceneNode = $from.node(sceneDepth);

    // Collect every body block that sits AFTER the current block — they
    // will migrate into the new scene so they stay visually connected to
    // the heading the writer just inserted above them.
    const trailing: ReturnType<typeof sceneNode.child>[] = [];
    // Compute each child's doc-position by accumulating nodeSize. Children
    // after the cursor block migrate into the new scene so they stay
    // visually attached to the heading the writer just inserted.
    let cursor = sceneStart + 1 + sceneNode.child(0).nodeSize;
    sceneNode.forEach((child, _offset, index) => {
      if (index === 0) return;
      if (cursor > blockStart) trailing.push(child);
      cursor += child.nodeSize;
    });

    // The current block's text becomes the new scene's title.
    const text = blockNode.textContent;
    const prefixNode = schema.nodes.prefix!.create(null, []);
    const titleNode = schema.nodes.title!.create(
      null,
      text ? [schema.text(text)] : [],
    );

    // Compute the new scene number against the existing numbered list.
    // The insert index is "how many numbered scenes live before this scene".
    const numberedOnly = collectNumberedSceneNumbers(state);
    let insertIndex = 0;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== "heading") return true;
      const num = (node.attrs.scene_number as string) ?? "";
      if (pos < sceneStart && num !== "") insertIndex += 1;
      return false;
    });
    // The new scene sits right after the current scene's heading, so it
    // inherits the next letter: scene N's body-split produces N + nextLetter.
    // sceneNumberForInsertion handles that when we pass insertIndex + 1 =
    // "position after the current scene in numbered order".
    const newSceneNumber = sceneNumberForInsertion(
      numberedOnly,
      insertIndex + 1,
    );

    const headingNode = schema.nodes.heading!.create(
      { scene_number: newSceneNumber },
      [prefixNode, titleNode],
    );
    const newScene = schema.nodes.scene!.create(null, [
      headingNode,
      ...trailing,
    ]);

    // Replace [blockStart..sceneEnd) with the new scene. Everything from
    // the cursor block to the end of the scene goes into the new scene;
    // the original scene keeps only the content before the block.
    const tr = state.tr.replaceWith(blockStart, sceneEnd, newScene);

    // Place cursor inside the new heading's prefix slot.
    //
    // After replaceWith(blockStart, sceneEnd, newScene), PM closes the
    // original scene with a SCENE_CLOSE token inserted AT blockStart before
    // inserting newScene. This shifts newScene one position forward:
    //
    //   blockStart + 0 → SCENE_CLOSE (of original scene, added by PM)
    //   blockStart + 1 → SCENE_OPEN  (newScene)
    //   blockStart + 2 → HEADING_OPEN
    //   blockStart + 3 → PREFIX_OPEN
    //   blockStart + 4 → first content of prefix  ← cursor goes here
    //
    // Use TextSelection.create (not .near) so the cursor pins inside the
    // isolating prefix even when it is empty.
    const prefixPos = blockStart + 4;
    tr.setSelection(TextSelection.create(tr.doc, prefixPos));

    if (dispatch) dispatch(tr);
    return true;
  };
};
