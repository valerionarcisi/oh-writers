import { useState, useEffect } from "react";
import type { ScreenplayView } from "../server/screenplay.server";
import { useAutoSave } from "../hooks/useScreenplay";
import { estimatePageCount, currentPageFromLine } from "../lib/page-counter";
import { MonacoWrapper } from "./MonacoWrapper";
import { ScreenplayToolbar } from "./ScreenplayToolbar";
import styles from "./ScreenplayEditor.module.css";

interface ScreenplayEditorProps {
  screenplay: ScreenplayView;
}

export function ScreenplayEditor({ screenplay }: ScreenplayEditorProps) {
  const [content, setContent] = useState(screenplay.content);
  const [isFocusMode, setFocusMode] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const totalPages = estimatePageCount(content);
  const currentPage = currentPageFromLine(cursorLine);
  const { isDirty, isSaving, isError } = useAutoSave(
    screenplay.id,
    content,
    screenplay.content,
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
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          onImport={setContent}
        />
      )}
      <div className={styles.editorArea}>
        <MonacoWrapper
          value={content}
          onChange={setContent}
          onCursorChange={setCursorLine}
        />
      </div>
    </div>
  );
}
