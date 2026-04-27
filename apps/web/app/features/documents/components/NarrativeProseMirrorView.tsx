import { useEffect, useRef } from "react";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { getNarrativeSchema } from "../lib/narrative-schema";
import { buildNarrativePlugins } from "../lib/narrative-plugins";
import { docToHtml, htmlToDoc } from "../lib/narrative-html";
import styles from "./NarrativeProseMirrorView.module.css";

interface NarrativeProseMirrorViewProps {
  value: string;
  onChange: (html: string) => void;
  onSelectionChange?: (text: string) => void;
  onReady?: (view: EditorView) => void;
  placeholder?: string;
  enableHeadings?: boolean;
  readOnly?: boolean;
  extraPlugins?: ReadonlyArray<Plugin>;
}

export function NarrativeProseMirrorView({
  value,
  onChange,
  onSelectionChange,
  onReady,
  placeholder,
  enableHeadings = false,
  readOnly = false,
  extraPlugins,
}: NarrativeProseMirrorViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (!mountRef.current) return;

    const schema = getNarrativeSchema(enableHeadings);
    const initialDoc = htmlToDoc(lastValueRef.current, schema);

    const state = EditorState.create({
      doc: initialDoc,
      plugins: [
        ...buildNarrativePlugins(schema, { placeholder }),
        ...(extraPlugins ?? []),
      ],
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (tr.docChanged) {
          const html = docToHtml(newState.doc, schema);
          lastValueRef.current = html;
          onChangeRef.current(html);
        }

        if (onSelectionChangeRef.current) {
          const { from, to } = newState.selection;
          const selected = newState.doc.textBetween(from, to, " ");
          onSelectionChangeRef.current(selected);
        }
      },
    });

    viewRef.current = view;
    onReady?.(view);

    if (typeof window !== "undefined") {
      const w = window as unknown as Record<string, unknown>;
      w["__ohWritersNarrativeHtml"] = () => lastValueRef.current;
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>)[
          "__ohWritersNarrativeHtml"
        ];
      }
    };
    // Re-mount only on the structural toggles. value changes are handled by
    // the second effect below to avoid resetting the caret on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, enableHeadings, placeholder, extraPlugins]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastValueRef.current) return;

    const schema = getNarrativeSchema(enableHeadings);
    const newDoc = htmlToDoc(value, schema);
    lastValueRef.current = value;

    const tr = view.state.tr.replaceWith(
      0,
      view.state.doc.content.size,
      newDoc.content,
    );
    view.dispatch(tr);
  }, [value, enableHeadings]);

  return (
    <div
      className={`${styles.wrapper} ${readOnly ? styles.readOnly : ""}`}
      data-testid="rich-text-editor"
    >
      <div ref={mountRef} className={styles.mount} />
    </div>
  );
}
