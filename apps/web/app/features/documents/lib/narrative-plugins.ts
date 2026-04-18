import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import {
  chainCommands,
  createParagraphNear,
  deleteSelection,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  newlineInCode,
  selectAll,
  splitBlock,
} from "prosemirror-commands";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import { inputRules, wrappingInputRule } from "prosemirror-inputrules";
import { Decoration, DecorationSet } from "prosemirror-view";
import { Schema } from "prosemirror-model";

const placeholderKey = new PluginKey("narrativePlaceholder");

const buildPlaceholderPlugin = (placeholder: string): Plugin => {
  return new Plugin({
    key: placeholderKey,
    props: {
      decorations(state: EditorState): DecorationSet | null {
        const { doc } = state;
        if (!placeholder) return null;
        if (doc.childCount !== 1) return null;
        const only = doc.firstChild;
        if (!only) return null;
        if (only.type.name !== "paragraph") return null;
        if (only.content.size !== 0) return null;

        const deco = Decoration.node(0, only.nodeSize, {
          class: "pm-narrative-empty",
          "data-placeholder": placeholder,
        });
        return DecorationSet.create(doc, [deco]);
      },
    },
  });
};

const enterCommand = (schema: Schema) => {
  const splitListIfPresent = schema.nodes["list_item"]
    ? splitListItem(schema.nodes["list_item"])
    : null;

  return chainCommands(
    newlineInCode,
    ...(splitListIfPresent ? [splitListIfPresent] : []),
    createParagraphNear,
    liftEmptyBlock,
    splitBlock,
  );
};

export const buildNarrativePlugins = (
  schema: Schema,
  options: { placeholder?: string } = {},
): Plugin[] => {
  const plugins: Plugin[] = [];

  const bulletList = schema.nodes["bullet_list"];
  const listItem = schema.nodes["list_item"];

  if (bulletList) {
    plugins.push(
      inputRules({
        rules: [wrappingInputRule(/^\s*([-*])\s$/, bulletList)],
      }),
    );
  }

  plugins.push(history());

  plugins.push(
    keymap({
      "Mod-z": undo,
      "Mod-y": redo,
      "Mod-Shift-z": redo,
      "Mod-a": selectAll,
    }),
  );

  if (bulletList && listItem) {
    plugins.push(
      keymap({
        Tab: sinkListItem(listItem),
        "Shift-Tab": liftListItem(listItem),
      }),
    );
  }

  plugins.push(
    keymap({
      Enter: enterCommand(schema),
      Backspace: chainCommands(deleteSelection, joinBackward),
      "Mod-Backspace": chainCommands(deleteSelection, joinBackward),
      "Shift-Backspace": chainCommands(deleteSelection, joinBackward),
      Delete: chainCommands(deleteSelection, joinForward),
      "Mod-Delete": chainCommands(deleteSelection, joinForward),
    }),
  );

  if (options.placeholder !== undefined) {
    plugins.push(buildPlaceholderPlugin(options.placeholder));
  }

  return plugins;
};

export const isParagraphActive = (state: EditorState): boolean =>
  state.selection.$from.parent.type.name === "paragraph";

export const isHeadingActive = (state: EditorState, level: number): boolean => {
  const node = state.selection.$from.parent;
  return node.type.name === "heading" && node.attrs["level"] === level;
};

export const isBulletListActive = (state: EditorState): boolean => {
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "bullet_list") return true;
  }
  return false;
};

export const toggleHeading = (
  schema: Schema,
  level: number,
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean => {
  const headingType = schema.nodes["heading"];
  const paragraphType = schema.nodes["paragraph"];
  if (!headingType || !paragraphType) return false;

  const { $from, $to } = state.selection;
  if (
    $from.parent.type.name === "heading" &&
    $from.parent.attrs["level"] === level
  ) {
    if (dispatch) {
      const tr = state.tr.setBlockType(
        $from.before(),
        $to.after(),
        paragraphType,
      );
      dispatch(tr);
    }
    return true;
  }
  if (dispatch) {
    const tr = state.tr.setBlockType($from.before(), $to.after(), headingType, {
      level,
    });
    dispatch(tr);
  }
  return true;
};

export const toggleBulletList = (
  schema: Schema,
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean => {
  const bulletList = schema.nodes["bullet_list"];
  const listItem = schema.nodes["list_item"];
  if (!bulletList || !listItem) return false;

  if (isBulletListActive(state)) {
    return liftListItem(listItem)(state, dispatch);
  }
  return wrapInList(bulletList)(state, dispatch);
};
