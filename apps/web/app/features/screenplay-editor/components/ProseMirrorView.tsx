import { useEffect, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../lib/schema";
import styles from "../styles/prosemirror.module.css";

interface ProseMirrorViewProps {
  readOnly?: boolean;
}

const buildInitialDoc = () =>
  schema.node("doc", null, [
    schema.node("scene", null, [
      schema.node("heading", null, [schema.text("INT. OFFICE — DAY")]),
      schema.node("action", null, [
        schema.text(
          "A sparse room. One desk, one chair, one lamp that flickers.",
        ),
      ]),
      schema.node("character", null, [schema.text("ANNA")]),
      schema.node("dialogue", null, [
        schema.text("You built this thing in how long?"),
      ]),
    ]),
  ]);

export function ProseMirrorView({ readOnly = false }: ProseMirrorViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const state = EditorState.create({
      doc: buildInitialDoc(),
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly]);

  return (
    <div
      ref={mountRef}
      className={styles.editorRoot}
      data-testid="prosemirror-view"
    />
  );
}
