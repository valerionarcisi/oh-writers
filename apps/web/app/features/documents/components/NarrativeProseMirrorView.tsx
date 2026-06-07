import { useEffect, useRef } from "react";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { getNarrativeSchema } from "../lib/narrative-schema";
import {
  buildNarrativePlugins,
  type NarrativeRealtime,
} from "../lib/narrative-plugins";
import { docToHtml, htmlToDoc } from "../lib/narrative-html";
import { isFragmentEmpty } from "~/features/realtime";
import { cesareHighlightPlugin } from "../lib/cesare-highlight-plugin";
import "~/features/realtime/lib/cursor-styles.css";
import "../lib/cesare-highlight.css";
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
  /** Yjs doc + provider for realtime collaboration. Null disables realtime. */
  realtime?: NarrativeRealtime | null;
  /** The document type this editor renders. Arms the Cesare "Mostra cosa è
   *  cambiato" underline decoration (Spec 63) for this document. */
  documentType?: string;
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
  realtime = null,
  documentType,
}: NarrativeProseMirrorViewProps) {
  const isRealtime = !!realtime;
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

    // Realtime mode: only seed the editor from `initialDoc` when the shared Yjs
    // fragment is still empty (this client is the first to open the room).
    // Otherwise the doc loads from the CRDT and we MUST start empty — passing a
    // non-empty `doc` while `ySyncPlugin` is bound to a populated fragment makes
    // y-prosemirror merge the initial doc ON TOP of the existing content on every
    // connect, growing the CRDT unboundedly until it serialises past V8's max
    // string length (the narrative "Invalid string length" freeze). Mirrors the
    // screenplay editor's seed guard.
    const seedFromInitial = !realtime || isFragmentEmpty(realtime.ydoc);

    const state = EditorState.create({
      ...(seedFromInitial ? { doc: initialDoc } : { schema }),
      plugins: [
        ...buildNarrativePlugins(schema, { placeholder, realtime }),
        ...(documentType ? [cesareHighlightPlugin(documentType)] : []),
        ...(extraPlugins ?? []),
      ],
    });

    const view: EditorView = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      // `ySyncPlugin` dispatches a transaction synchronously during the
      // EditorView constructor (initial CRDT → doc reconciliation), before the
      // outer `view` binding is assigned — so we read state off the instance
      // ProseMirror hands us (`this`) instead of the still-uninitialised const.
      dispatchTransaction(this: EditorView, tr) {
        const newState = this.state.apply(tr);
        this.updateState(newState);

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
  }, [
    readOnly,
    enableHeadings,
    placeholder,
    extraPlugins,
    isRealtime,
    documentType,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastValueRef.current) return;

    // An incoming `value` that differs from what the editor last emitted is an
    // AUTHORITATIVE document replacement from outside the editor — a Cesare
    // agentic edit or a version restore, never a local keystroke (those flow
    // through `dispatchTransaction` and keep `lastValueRef` in sync). We apply
    // it through a ProseMirror transaction so that in realtime mode the change
    // is carried into the shared CRDT by `ySyncPlugin` (the Cesare live-diff
    // highlight and "Mostra modifiche" then paint against the applied doc).
    const schema = getNarrativeSchema(enableHeadings);

    // In realtime mode the CRDT is the source of truth. Only replace when the
    // editor's CURRENT doc actually differs from the incoming value — a remote
    // peer edit may have already advanced the doc past a now-stale `value`
    // prop, and re-applying it would clobber the concurrent change.
    if (isRealtime && docToHtml(view.state.doc, schema) === value) {
      lastValueRef.current = value;
      return;
    }

    const newDoc = htmlToDoc(value, schema);
    lastValueRef.current = value;

    const tr = view.state.tr.replaceWith(
      0,
      view.state.doc.content.size,
      newDoc.content,
    );
    view.dispatch(tr);
  }, [value, enableHeadings, isRealtime]);

  return (
    <div
      className={`${styles.wrapper} ${readOnly ? styles.readOnly : ""}`}
      data-testid="rich-text-editor"
    >
      <div ref={mountRef} className={styles.mount} />
    </div>
  );
}
