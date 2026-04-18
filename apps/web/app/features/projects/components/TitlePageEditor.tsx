import { useEffect, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { Node as PMNode } from "prosemirror-model";
import { titlePageSchema } from "../title-page-pm/schema";
import { emptyDoc } from "../title-page-pm/empty-doc";
import styles from "./TitlePageEditor.module.css";

interface TitlePageEditorProps {
  /** Project title — used to seed the title node when no doc exists yet. */
  projectTitle: string;
  /** Persisted PM doc JSON from the server (jsonb column), or null on first open. */
  initialDoc: Record<string, NonNullable<unknown>> | null;
  /** Emits the raw PM doc JSON on every content change. */
  onDocChange: (doc: Record<string, NonNullable<unknown>>) => void;
  /** When true the editor is non-editable. */
  readOnly?: boolean;
}

const buildInitialDoc = (
  raw: Record<string, NonNullable<unknown>> | null,
  projectTitle: string,
): PMNode => {
  if (!raw) return emptyDoc(projectTitle);
  return titlePageSchema.nodeFromJSON(raw);
};

export function TitlePageEditor({
  projectTitle,
  initialDoc,
  onDocChange,
  readOnly = false,
}: TitlePageEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const state = EditorState.create({
      doc: buildInitialDoc(initialDoc, projectTitle),
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
        keymap(baseKeymap),
      ],
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      dispatchTransaction(tr) {
        const nextState = view.state.apply(tr);
        view.updateState(nextState);
        if (tr.docChanged) {
          onDocChange(
            nextState.doc.toJSON() as Record<string, NonNullable<unknown>>,
          );
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

  return (
    <div className={styles.canvas} data-testid="title-page-canvas">
      <div className={styles.pageShell} data-testid="title-page-sheet">
        <div
          ref={mountRef}
          className={`${styles.editor}${readOnly ? ` ${styles.readOnly}` : ""}`}
          data-testid="title-page-editor"
        />
      </div>
    </div>
  );
}
