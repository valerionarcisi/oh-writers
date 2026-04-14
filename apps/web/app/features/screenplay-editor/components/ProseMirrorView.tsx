import { useEffect, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { fountainKeymap } from "../lib/plugins/keymap";
import {
  sceneNumbersPlugin,
  injectSceneNumberStyles,
} from "../lib/plugins/scene-numbers";
import { injectProseMirrorStyles } from "../lib/plugins/prosemirror-styles";
import { buildAutocompletePlugin } from "../lib/plugins/autocomplete";
import {
  buildPaginatorPlugin,
  injectPaginatorStyles,
} from "../lib/plugins/paginator";
import { schema } from "../lib/schema";
import { fountainToDoc } from "../lib/fountain-to-doc";

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
  /** When true the editor is non-editable — used by the version viewer. */
  readOnly?: boolean;
}

export function ProseMirrorView({
  value,
  initialDoc,
  onChange,
  onDocChange,
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
    injectSceneNumberStyles();
    injectPaginatorStyles();

    // Prefer pm_doc JSON from DB (faster, no re-parse); fall back to Fountain text
    const initialPmDoc = initialDoc
      ? schema.nodeFromJSON(initialDoc)
      : fountainToDoc(value);

    const state = EditorState.create({
      doc: initialPmDoc,
      plugins: [
        history(),
        fountainKeymap,
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
        sceneNumbersPlugin,
        buildPaginatorPlugin(),
        buildAutocompletePlugin(),
      ],
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (tr.docChanged) {
          import("../lib/doc-to-fountain").then(({ docToFountain }) => {
            const fountain = docToFountain(newState.doc);
            lastValueRef.current = fountain;
            onChange(fountain);
            onDocChange?.(newState.doc.toJSON() as Record<string, unknown>);
          });
        }
      },
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Sync external value changes (e.g. version restore, import)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastValueRef.current) return;

    lastValueRef.current = value;

    import("../lib/fountain-to-doc").then(({ fountainToDoc: ftd }) => {
      const newDoc = ftd(value);
      const tr = view.state.tr.replaceWith(
        0,
        view.state.doc.content.size,
        newDoc.content,
      );
      view.dispatch(tr);
    });
  }, [value]);

  return <div ref={mountRef} data-testid="prosemirror-view" />;
}
