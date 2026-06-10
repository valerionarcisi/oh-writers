import { useEffect, useRef } from "react";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { updateYFragment } from "y-prosemirror";
import * as Y from "yjs";
import type { Node as PMNode } from "prosemirror-model";
import { getNarrativeSchema } from "../lib/narrative-schema";
import {
  buildNarrativePlugins,
  type NarrativeRealtime,
} from "../lib/narrative-plugins";
import { docToHtml, htmlToDoc } from "../lib/narrative-html";
import { isFragmentEmpty } from "~/features/realtime";
import { XML_FRAGMENT } from "~/features/realtime/lib/yjs-plugins";
import { cesareHighlightPlugin } from "../lib/cesare-highlight-plugin";
import "~/features/realtime/lib/cursor-styles.css";
import "../lib/cesare-highlight.css";
import styles from "./NarrativeProseMirrorView.module.css";

// Build the CRDT update that seeds an empty room from the initial doc. The
// seeding doc's clientID is a HASH of the content, so two clients that race
// the first-open of the same document generate byte-identical ops and the
// double-apply deduplicates (random clientIDs would keep BOTH copies — the
// text would render twice). Divergent contents hash to different clientIDs
// and merge as duplication, never as same-ID corruption.
const seedUpdateFromDoc = (initialDoc: PMNode): Uint8Array => {
  const json = JSON.stringify(initialDoc.toJSON());
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash ^ json.charCodeAt(i)) * 0x01000193) >>> 0;
  }
  const seedDoc = new Y.Doc();
  seedDoc.clientID = hash;
  const fragment = seedDoc.getXmlFragment(XML_FRAGMENT);
  seedDoc.transact(() => {
    updateYFragment(seedDoc, fragment, initialDoc, new Map());
  });
  const update = Y.encodeStateAsUpdate(seedDoc);
  seedDoc.destroy();
  return update;
};

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
  // True for one render right after the editor (re)mounts. In realtime mode the
  // CRDT — not the HTTP `value` prop — is the source of truth on mount, so the
  // value-sync effect must NOT push `value` over the just-loaded CRDT doc: the
  // two differ only in markup/node identity, and re-applying `value` records a
  // full delta into the Yjs state that GROWS the CRDT on every mount/reload
  // (the doc bloated past its size cap and broke saving). We skip that first
  // sync; genuine external replacements (Cesare, version restore) arrive as a
  // later `value` change and still apply.
  const justMountedRef = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (!mountRef.current) return;
    justMountedRef.current = true;

    const schema = getNarrativeSchema(enableHeadings);
    const initialDoc = htmlToDoc(lastValueRef.current, schema);

    // Realtime: the shared fragment is the source of truth. When it is still
    // empty (this client is the FIRST to open the room — a brand-new doc, or a
    // doc whose content lives only in the HTTP `value`), seed the FRAGMENT
    // directly by merging a CRDT update built from the initial doc. Passing
    // `doc: initialDoc` to EditorState does NOT seed: y-prosemirror's binding
    // renders the fragment over the editor on init (`_forceRerender`), so an
    // empty fragment WIPES the initial doc and the wipe leaks into onChange →
    // autosave (the BUG-N53 clobber). The editor is held back behind a
    // skeleton until the room has SYNCED (NarrativeEditor/FreeNarrativeEditor
    // gates) and the ws-server replies to sync only after loading persisted
    // state, so `isFragmentEmpty` is authoritative here: an empty fragment
    // means the room is genuinely empty.
    if (realtime && isFragmentEmpty(realtime.ydoc)) {
      Y.applyUpdate(realtime.ydoc, seedUpdateFromDoc(initialDoc));
    }

    const state = EditorState.create({
      ...(realtime ? { schema } : { doc: initialDoc }),
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

    // First post-mount run in realtime mode: the CRDT has just loaded and IS the
    // source of truth — do not push the HTTP `value` over it (that grows the Yjs
    // state on every mount). Adopt `value` as the baseline and bail; subsequent
    // `value` changes are real external replacements and still apply.
    if (isRealtime && justMountedRef.current) {
      justMountedRef.current = false;
      lastValueRef.current = value;
      return;
    }
    justMountedRef.current = false;

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
    if (isRealtime) {
      const currentHtml = docToHtml(view.state.doc, schema);
      if (currentHtml === value) {
        lastValueRef.current = value;
        return;
      }
      // An external value that EMPTIES a populated live doc is applied (it is
      // authoritative: "riparti da zero" / switching to a blank version flow
      // through this prop), but it is also the signature of the BUG-N54
      // stale-value clobber — every kill emptied a populated realtime doc
      // from the outside. Log it so a regression is visible in the console /
      // client events instead of silent data loss.
      if (value.trim().length === 0 && currentHtml.length > 0) {
        console.warn(
          "[narrative-editor] external value emptied a populated realtime doc",
          { documentType },
        );
      }
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
