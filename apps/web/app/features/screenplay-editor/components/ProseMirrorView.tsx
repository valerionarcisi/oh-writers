import { useEffect, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  chainCommands,
  deleteSelection,
  joinBackward,
  joinForward,
  selectAll,
  createParagraphNear,
  liftEmptyBlock,
} from "prosemirror-commands";
import { fountainKeymap } from "../lib/plugins/keymap";
import { injectProseMirrorStyles } from "../lib/plugins/prosemirror-styles";
import { buildAutocompletePlugin } from "../lib/plugins/autocomplete";
import { buildSlotPickerPlugin } from "../lib/plugins/scene-slot-picker";
import { createHeadingNodeView } from "../lib/plugins/heading-nodeview";
import {
  buildPaginatorPlugin,
  injectPaginatorStyles,
} from "../lib/plugins/paginator";
import { schema } from "../lib/schema";
import { fountainToDoc } from "../lib/fountain-to-doc";
import { docToFountain } from "../lib/doc-to-fountain";
import { migratePmDoc } from "@oh-writers/domain";
import type { ElementType } from "../lib/fountain-element-detector";

interface ProseMirrorViewProps {
  /** Fountain text — source of truth for version restore and external imports. */
  value: string;
  /**
   * PM doc JSON from the DB (pm_doc column). When present the editor loads
   * directly from JSON, skipping the Fountain re-parse on every mount.
   * Null on first open (before the first save fills the column).
   */
  initialDoc?: Record<string, unknown> | null;
  /** Emits the Fountain serialisation of the doc on every content change. */
  onChange: (fountain: string) => void;
  /**
   * Emits the raw PM doc JSON on every content change.
   * Used by ScreenplayEditor to forward the doc to the auto-save mutation
   * so pm_doc is kept in sync with the DB without a second round-trip.
   */
  onDocChange?: (doc: Record<string, unknown>) => void;
  /**
   * Emits the block type at the cursor on every selection change.
   * Drives the active-element pill in the toolbar.
   * "scene" is emitted when the cursor is in a heading node.
   */
  onElementChange?: (element: ElementType) => void;
  /**
   * Emits the 1-based index of the scene containing the cursor, or null when
   * the cursor is positioned before the first heading (no enclosing scene).
   * Drives the `s.N/total` indicator in the toolbar.
   */
  onSceneIndexChange?: (index: number | null) => void;
  /**
   * Called once after the view is mounted. Lets the parent hold a handle to
   * the EditorView (e.g. to dispatch commands from the toolbar) without
   * threading refs through the component tree.
   */
  onReady?: (view: EditorView) => void;
  /** When true the editor is non-editable — used by the version viewer. */
  readOnly?: boolean;
}

// Maps PM node type names to the ElementType the toolbar understands.
// "heading" → "scene" because from the writer's POV a heading IS a scene line.
// "prefix" / "title" are child nodes of a heading (the INT./EXT. slot and the
// location/time slot) — when the cursor lands in either, the block is still a
// scene as far as the toolbar is concerned.
const NODE_TO_ELEMENT: Record<string, ElementType> = {
  heading: "scene",
  prefix: "scene",
  title: "scene",
  action: "action",
  character: "character",
  dialogue: "dialogue",
  parenthetical: "parenthetical",
  transition: "transition",
};

export function ProseMirrorView({
  value,
  initialDoc,
  onChange,
  onDocChange,
  onElementChange,
  onSceneIndexChange,
  onReady,
  readOnly = false,
}: ProseMirrorViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Track the last fountain string we fed in so we don't re-parse on our own
  // onChange emissions (which would reset cursor position).
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (!mountRef.current) return;

    injectProseMirrorStyles();
    injectPaginatorStyles();

    // Prefer pm_doc JSON from DB (faster, no re-parse); fall back to Fountain text.
    // migratePmDoc is idempotent — it rewrites legacy single-text headings into
    // the current prefix+title shape; already-current docs pass through untouched.
    const initialPmDoc = initialDoc
      ? schema.nodeFromJSON(migratePmDoc(initialDoc))
      : fountainToDoc(value);

    const state = EditorState.create({
      doc: initialPmDoc,
      plugins: [
        history(),
        // Scene-heading pickers: each fires only when the cursor is inside
        // its respective slot, offering values the writer has already used
        // elsewhere in the doc (rankByFrequency, filterSuggestions). First
        // match wins on handleKeyDown, so these come before the generic
        // character/location autocomplete.
        buildSlotPickerPlugin("prefix"),
        buildSlotPickerPlugin("title"),
        // Character / transition autocomplete — unchanged.
        buildAutocompletePlugin(),
        fountainKeymap,
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
        // Delete / Backspace — only the safe commands. We deliberately omit
        // `selectNodeBackward` / `selectNodeForward` from the default baseKeymap
        // chain because at scene-heading boundaries they "select the whole
        // scene node", and the next Delete then wipes the whole doc. Our chain
        // stops at joinBackward/Forward — if those can't proceed we swallow the
        // key (returning true via the final command) rather than promoting to a
        // destructive node-selection.
        keymap({
          Backspace: chainCommands(deleteSelection, joinBackward),
          "Mod-Backspace": chainCommands(deleteSelection, joinBackward),
          "Shift-Backspace": chainCommands(deleteSelection, joinBackward),
          Delete: chainCommands(deleteSelection, joinForward),
          "Mod-Delete": chainCommands(deleteSelection, joinForward),
          "Mod-a": selectAll,
          // Default Enter fallback — our fountainKeymap handles Enter first; if
          // it declines (which shouldn't normally happen) we want at least the
          // standard PM Enter behavior for edge cases like empty-doc split.
          "Shift-Enter": chainCommands(createParagraphNear, liftEmptyBlock),
        }),
        buildPaginatorPlugin(),
      ],
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      nodeViews: {
        heading: (node, v, getPos) => createHeadingNodeView(node, v, getPos),
      },
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        // Emit the block type at cursor on every transaction (doc or selection change).
        if (onElementChange) {
          const blockType = newState.selection.$from.parent.type.name;
          const element = NODE_TO_ELEMENT[blockType] ?? "action";
          onElementChange(element);
        }

        // Scene index at cursor: count heading nodes whose start offset is
        // <= the cursor position. Zero means the cursor sits before the
        // first heading — we report null so the toolbar renders "—".
        if (onSceneIndexChange) {
          const cursor = newState.selection.$from.pos;
          let count = 0;
          newState.doc.descendants((n, pos) => {
            if (n.type.name === "heading") {
              if (pos <= cursor) count += 1;
              return false;
            }
            return true;
          });
          onSceneIndexChange(count > 0 ? count : null);
        }

        if (tr.docChanged) {
          const fountain = docToFountain(newState.doc);
          lastValueRef.current = fountain;
          onChange(fountain);
          onDocChange?.(newState.doc.toJSON() as Record<string, unknown>);
        }
      },
    });

    viewRef.current = view;
    onReady?.(view);

    // Expose a getter for E2E tests so they can read the current Fountain
    // content without depending on Monaco internals. `lastValueRef` is kept
    // in sync on every docChanged transaction.
    if (typeof window !== "undefined") {
      const w = window as unknown as Record<string, unknown>;
      w["__ohWritersFountain"] = () => lastValueRef.current;

      // Authoritative PM block-type at cursor — DOM Selection API is unreliable
      // when the cursor sits inside an empty inline span (prefix/title), so tests
      // consult the PM state directly.
      w["__ohWritersBlock"] = () => {
        const v = viewRef.current;
        if (!v) return null;
        return v.state.selection.$from.parent.type.name;
      };

      // Append a fresh empty action block at the end of the doc and place the
      // cursor in it. Needed by E2E tests because keyboard.press("End") only
      // moves to end-of-visible-line in word-wrapped paragraphs, and
      // subsequent Enter would split mid-paragraph instead of creating a new
      // empty block after the last action.
      w["__ohWritersAppendAction"] = () => {
        const v = viewRef.current;
        if (!v) return;
        import("../lib/schema").then(({ schema: s }) => {
          import("prosemirror-state").then(({ TextSelection }) => {
            const { state, dispatch } = v;
            const actionType = s.nodes["action"];
            if (!actionType) return;
            const lastScenePos = state.doc.content.size - 1;
            const $end = state.doc.resolve(lastScenePos);
            let sceneDepth = $end.depth;
            while (
              sceneDepth > 0 &&
              $end.node(sceneDepth).type.name !== "scene"
            ) {
              sceneDepth -= 1;
            }
            const insertPos =
              sceneDepth > 0
                ? $end.after(sceneDepth) - 1
                : state.doc.content.size;
            const tr = state.tr.insert(insertPos, actionType.create());
            tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
            dispatch(tr);
            v.focus();
          });
        });
      };
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>)[
          "__ohWritersFountain"
        ];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Sync external value changes (e.g. version restore, import)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastValueRef.current) return;

    lastValueRef.current = value;

    const newDoc = fountainToDoc(value);
    const tr = view.state.tr.replaceWith(
      0,
      view.state.doc.content.size,
      newDoc.content,
    );
    view.dispatch(tr);
  }, [value]);

  return (
    <div
      ref={mountRef}
      data-testid="prosemirror-view"
      data-pm-screenplay="true"
    />
  );
}
