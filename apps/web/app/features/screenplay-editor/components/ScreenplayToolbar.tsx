import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SaveIndicator } from "./SaveIndicator";
import { ToolbarMenu } from "./ToolbarMenu";
import type { ElementType } from "../lib/fountain-element-detector";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayToolbarProps {
  projectId: string;
  screenplayId: string;
  currentVersionId: string | null;
  currentPage: number;
  totalPages: number;
  currentSceneIndex: number | null;
  totalScenes: number;
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  isOffline: boolean;
  lastSavedAt: number | null;
  onFlushSave: () => void;
  isFocusMode: boolean;
  hasContent: boolean;
  currentElement: ElementType;
  onSetElement: (element: ElementType) => void;
  onToggleFocusMode: () => void;
  onImport: (fountain: string) => void;
  nextVersionLabel?: string | null;
  onCreateVersionThenImport?: (fountain: string) => void;
  onToggleVersions: () => void;
  isVersionsPanelOpen: boolean;
  currentVersionLabel?: string | null;
  hideSaveIndicator?: boolean;
  /** Opens the "Resequence all scenes?" confirmation modal and, on confirm,
   *  reruns resequenceAll over the whole doc via the editor view. */
  onResequenceAll?: () => void;
  /** True when the signed-in user can mutate this project (owner or editor
   *  on a non-archived project). Gates write affordances. */
  canEdit: boolean;
}

const ELEMENT_LABELS: Record<ElementType, string> = {
  scene: "Scene",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Paren",
  transition: "Transition",
};

const ELEMENT_SHORTCUTS: Record<ElementType, string> = {
  scene: "⌥S",
  action: "⌥A",
  character: "⌥C",
  dialogue: "⌥D",
  parenthetical: "⌥P",
  transition: "⌥T",
};

const ELEMENT_ORDER: ElementType[] = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];

export function ScreenplayToolbar({
  projectId,
  currentPage,
  totalPages,
  currentSceneIndex,
  totalScenes,
  isDirty,
  isSaving,
  isError,
  isOffline,
  lastSavedAt,
  onFlushSave,
  isFocusMode,
  hasContent,
  currentElement,
  onSetElement,
  onToggleFocusMode,
  onImport,
  nextVersionLabel = null,
  onCreateVersionThenImport,
  onToggleVersions,
  isVersionsPanelOpen,
  currentVersionLabel = null,
  hideSaveIndicator = false,
  onResequenceAll,
  canEdit,
}: ScreenplayToolbarProps) {
  const [resequenceConfirmOpen, setResequenceConfirmOpen] = useState(false);
  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <Link
          to="/projects/$id"
          params={{ id: projectId }}
          className={styles.backLink}
        >
          ← Back
        </Link>
      </div>

      {/* Element indicator strip — pills double as element-converter buttons.
          Clicking one converts the block at the cursor to that element type. */}
      <div
        className={styles.elementStrip}
        role="toolbar"
        aria-label="Convert current block"
      >
        {ELEMENT_ORDER.map((el) => (
          <button
            key={el}
            type="button"
            className={`${styles.elementPill} ${currentElement === el ? styles.elementPillActive : ""}`}
            title={`${ELEMENT_LABELS[el]} (${ELEMENT_SHORTCUTS[el]})`}
            aria-pressed={currentElement === el}
            onClick={() => onSetElement(el)}
          >
            {ELEMENT_LABELS[el]}
          </button>
        ))}
      </div>

      <div className={styles.right}>
        <span className={styles.pageCount} data-testid="page-indicator">
          p.{currentPage}/{totalPages}
        </span>
        <span className={styles.pageCount} data-testid="scene-indicator">
          s.{currentSceneIndex ?? "—"}/{totalScenes}
        </span>
        {!hideSaveIndicator && (
          <SaveIndicator
            isDirty={isDirty}
            isSaving={isSaving}
            isError={isError}
            isOffline={isOffline}
            lastSavedAt={lastSavedAt}
            onFlush={onFlushSave}
          />
        )}
        <button
          className={`${styles.focusBtn} ${isFocusMode ? styles.focusBtnActive : ""}`}
          onClick={onToggleFocusMode}
          type="button"
          title="Toggle focus mode (Ctrl+Shift+F)"
          aria-pressed={isFocusMode}
        >
          Focus
        </button>
        <ToolbarMenu
          hasContent={hasContent}
          onImport={onImport}
          nextVersionLabel={nextVersionLabel}
          onCreateVersionThenImport={onCreateVersionThenImport}
          onToggleVersions={onToggleVersions}
          isVersionsPanelOpen={isVersionsPanelOpen}
          currentVersionLabel={currentVersionLabel}
          onResequenceAll={
            onResequenceAll && canEdit
              ? () => setResequenceConfirmOpen(true)
              : undefined
          }
        />
      </div>
      {resequenceConfirmOpen && onResequenceAll ? (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Resequence all scenes"
          data-testid="resequence-confirm-modal"
          onClick={() => setResequenceConfirmOpen(false)}
        >
          <div
            className={styles.confirmModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.confirmTitle}>Resequence all scenes?</h2>
            <p className={styles.confirmBody}>
              This renumbers every scene from 1 upward based on the current
              document order. Locked scenes keep their numbers — others get
              assigned around them with letter suffixes if needed. This
              can&apos;t be undone automatically.
            </p>
            <div className={styles.confirmFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                data-testid="resequence-confirm-cancel"
                onClick={() => setResequenceConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                data-testid="resequence-confirm-apply"
                onClick={() => {
                  onResequenceAll();
                  setResequenceConfirmOpen(false);
                }}
              >
                Resequence
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
