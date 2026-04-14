import { useEffect, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../lib/schema";
import { fountainToDoc } from "../lib/fountain-to-doc";
import styles from "../styles/prosemirror.module.css";

interface ProseMirrorViewProps {
  value: string;
  onChange: (fountain: string) => void;
  readOnly?: boolean;
}

export function ProseMirrorView({
  value,
  onChange,
  readOnly = false,
}: ProseMirrorViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Track the last fountain string we fed in so we don't re-parse on our own
  // onChange emissions (which would reset cursor position).
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (!mountRef.current) return;

    const state = EditorState.create({
      doc: fountainToDoc(value),
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (tr.docChanged) {
          // Lazy import to avoid circular dep at module level
          import("../lib/doc-to-fountain").then(({ docToFountain }) => {
            const fountain = docToFountain(newState.doc);
            lastValueRef.current = fountain;
            onChange(fountain);
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
    // Intentionally only runs once — external value changes handled below
  }, [readOnly]);

  // Sync external value changes (e.g. version restore, import) without
  // destroying the editor or losing cursor position when possible.
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

  return (
    <div
      ref={mountRef}
      className={styles.editorRoot}
      data-testid="prosemirror-view"
    />
  );
}
