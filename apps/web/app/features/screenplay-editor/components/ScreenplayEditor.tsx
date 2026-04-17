import { useState, useEffect, useRef, useCallback } from "react";
import type { EditorView } from "prosemirror-view";
import type { ScreenplayView } from "../server/screenplay.server";
import { useAutoSave, useSaveScreenplay } from "../hooks/useScreenplay";
import { estimatePageCount, currentPageFromLine } from "../lib/page-counter";
import type { ElementType } from "../lib/fountain-element-detector";
import { setElement } from "../lib/schema-commands";
import { ProseMirrorView } from "./ProseMirrorView";
import { ScreenplayToolbar } from "./ScreenplayToolbar";
import { SceneNumberConflictModal } from "./SceneNumberConflictModal";
import type { ConflictChoice } from "./SceneNumberConflictModal";
import {
  SCENE_NUMBER_CONFLICT_EVENT,
  SCENE_NUMBER_TOAST_EVENT,
  dispatchSceneNumberToast,
  resequenceWholeDoc,
  type SceneNumberConflictDetail,
  type SceneNumberToastDetail,
} from "../lib/plugins/scene-number-commands";
import styles from "./ScreenplayEditor.module.css";

interface ScreenplayEditorProps {
  screenplay: ScreenplayView;
}

export function ScreenplayEditor({ screenplay }: ScreenplayEditorProps) {
  const [content, setContent] = useState(screenplay.content);
  const [pmDoc, setPmDoc] = useState<Record<string, unknown> | null>(
    (screenplay.pmDoc as Record<string, unknown> | null) ?? null,
  );
  const [isFocusMode, setFocusMode] = useState(false);
  const [cursorLine] = useState(1);
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const [conflict, setConflict] = useState<SceneNumberConflictDetail | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const handleSetElement = useCallback((el: ElementType) => {
    const view = viewRef.current;
    if (!view) return;
    setElement(el)(view.state, view.dispatch, view);
    view.focus();
  }, []);
  const totalPages = estimatePageCount(content);
  const currentPage = currentPageFromLine(cursorLine);
  const { isDirty, isSaving, isError } = useAutoSave(
    screenplay.id,
    content,
    screenplay.content,
    pmDoc,
  );
  const save = useSaveScreenplay();

  // E2E test hook: bypass the 30-second debounce and trigger an immediate save.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    w["__ohWritersForceSave"] = () =>
      save.mutate({ screenplayId: screenplay.id, content, pmDoc });
    return () => {
      delete w["__ohWritersForceSave"];
    };
  }, [save, screenplay.id, content, pmDoc]);

  // Scene-number conflict bus — heading NodeView dispatches on Enter/blur
  // when the proposed number collides with another scene. We open the modal
  // and forward the user's choice back through the event's resolve callback.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SceneNumberConflictDetail>).detail;
      setConflict(detail);
    };
    window.addEventListener(SCENE_NUMBER_CONFLICT_EVENT, handler);
    return () =>
      window.removeEventListener(SCENE_NUMBER_CONFLICT_EVENT, handler);
  }, []);

  const onConflictChoice = useCallback(
    (choice: ConflictChoice) => {
      conflict?.resolve(choice);
      setConflict(null);
    },
    [conflict],
  );

  // Toast bus — raised by popover "Resequence from here" and toolbar
  // "Resequence scenes" when the constraints can't be satisfied.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SceneNumberToastDetail>).detail;
      setToast(detail.message);
      const t = window.setTimeout(() => setToast(null), 4000);
      return () => window.clearTimeout(t);
    };
    window.addEventListener(SCENE_NUMBER_TOAST_EVENT, handler);
    return () => window.removeEventListener(SCENE_NUMBER_TOAST_EVENT, handler);
  }, []);

  const onResequenceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const r = resequenceWholeDoc(view);
    if (!r.ok) dispatchSceneNumberToast(r.reason);
  }, []);

  // Ctrl/Cmd+Shift+F keybinding dispatches this event from within the editor
  useEffect(() => {
    const handleToggle = () => setFocusMode((prev) => !prev);
    window.addEventListener("screenplay:toggleFocusMode", handleToggle);
    return () =>
      window.removeEventListener("screenplay:toggleFocusMode", handleToggle);
  }, []);

  return (
    <div className={`${styles.page} ${isFocusMode ? styles.focusMode : ""}`}>
      {isFocusMode ? (
        <div className={styles.focusToolbar}>
          <button
            className={styles.focusExitBtn}
            onClick={() => setFocusMode(false)}
            type="button"
            title="Exit focus mode"
          >
            Exit Focus
          </button>
        </div>
      ) : (
        <ScreenplayToolbar
          projectId={screenplay.projectId}
          screenplayId={screenplay.id}
          currentVersionId={screenplay.currentVersionId ?? null}
          currentPage={currentPage}
          totalPages={totalPages}
          isDirty={isDirty}
          isSaving={isSaving}
          isError={isError}
          isFocusMode={isFocusMode}
          hasContent={content.trim().length > 0}
          currentElement={currentElement}
          onSetElement={handleSetElement}
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          onImport={setContent}
          onResequenceAll={onResequenceAll}
          canEdit={screenplay.canEdit ?? false}
        />
      )}
      <div className={styles.editorArea}>
        <div className={styles.pageShell}>
          <ProseMirrorView
            value={content}
            initialDoc={pmDoc}
            onChange={setContent}
            onDocChange={setPmDoc}
            onElementChange={setCurrentElement}
            readOnly={!(screenplay.canEdit ?? false)}
            onReady={(view) => {
              viewRef.current = view;
            }}
          />
        </div>
      </div>
      {conflict ? (
        <SceneNumberConflictModal
          current={conflict.current}
          proposed={conflict.proposed}
          onResolve={onConflictChoice}
        />
      ) : null}
      {toast ? (
        <div
          role="status"
          className={styles.toast}
          data-testid="scene-number-toast"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
