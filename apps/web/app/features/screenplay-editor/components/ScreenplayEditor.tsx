import { useState, useEffect } from "react";
import type { ScreenplayView } from "../server/screenplay.server";
import { useAutoSave } from "../hooks/useScreenplay";
import { estimatePageCount, currentPageFromLine } from "../lib/page-counter";
import type { ElementType } from "../lib/fountain-element-detector";
import { MonacoWrapper } from "./MonacoWrapper";
import { ProseMirrorView } from "./ProseMirrorView";
import { ScreenplayToolbar } from "./ScreenplayToolbar";
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
  const [cursorLine, setCursorLine] = useState(1);
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const [isEditorV2] = useState(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem("screenplay_editor_v2") === "true",
  );
  const totalPages = estimatePageCount(content);
  const currentPage = currentPageFromLine(cursorLine);
  const { isDirty, isSaving, isError } = useAutoSave(
    screenplay.id,
    content,
    screenplay.content,
    pmDoc,
  );

  // Ctrl/Cmd+Shift+F keybinding dispatches this event from within Monaco
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
          currentPage={currentPage}
          totalPages={totalPages}
          isDirty={isDirty}
          isSaving={isSaving}
          isError={isError}
          isFocusMode={isFocusMode}
          hasContent={content.trim().length > 0}
          currentElement={currentElement}
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          onImport={setContent}
        />
      )}
      <div className={styles.editorArea}>
        <div
          className={`${styles.pageShell} ${isEditorV2 ? styles.pageShellV2 : ""}`}
        >
          {isEditorV2 ? (
            <ProseMirrorView
              value={content}
              initialDoc={pmDoc}
              onChange={setContent}
              onDocChange={setPmDoc}
            />
          ) : (
            <MonacoWrapper
              value={content}
              onChange={setContent}
              onCursorChange={setCursorLine}
              onElementChange={setCurrentElement}
            />
          )}
        </div>
      </div>
    </div>
  );
}
