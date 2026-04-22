import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Dialog } from "@oh-writers/ui";
import { SaveIndicator } from "./SaveIndicator";
import { ToolbarMenu } from "./ToolbarMenu";
import { DraftMetaBadge } from "~/features/projects";
import type { ElementType } from "../lib/fountain-element-detector";
import type { TitlePageDocJSON } from "../lib/title-page-from-pdf";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayToolbarProps {
  projectId: string;
  screenplayId: string;
  currentVersionId: string | null;
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
  /** True when the signed-in user owns the project. Gates Owner-only entries
   *  (e.g. Frontespizio per spec 07b). */
  isOwner: boolean;
  /** Opens the PDF export modal (Spec 05j). The button is disabled when
   *  the screenplay has no content. */
  onOpenExportPdf?: () => void;
  isExportingPdf?: boolean;
  /** Forwarded to ToolbarMenu → useImportPdf so the parent can react when
   *  Pass 0 of the PDF import detects a title page. */
  onTitlePageDetected?: (doc: TitlePageDocJSON) => void;
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
  isOwner,
  onOpenExportPdf,
  isExportingPdf = false,
  onTitlePageDetected,
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
        <DraftMetaBadge projectId={projectId} />
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
        {onOpenExportPdf && (
          <button
            type="button"
            className={styles.focusBtn}
            onClick={onOpenExportPdf}
            disabled={!hasContent || isExportingPdf}
            data-testid="screenplay-export-pdf"
          >
            {isExportingPdf ? "Exporting…" : "Export PDF"}
          </button>
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
          projectId={projectId}
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
          isOwner={isOwner}
          onTitlePageDetected={onTitlePageDetected}
        />
      </div>
      {resequenceConfirmOpen && onResequenceAll ? (
        <Dialog
          isOpen
          onClose={() => setResequenceConfirmOpen(false)}
          title="Resequence all scenes?"
          data-testid="resequence-confirm-modal"
          actions={
            <>
              <Button
                variant="ghost"
                data-testid="resequence-confirm-cancel"
                onClick={() => setResequenceConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                data-testid="resequence-confirm-apply"
                onClick={() => {
                  onResequenceAll();
                  setResequenceConfirmOpen(false);
                }}
              >
                Resequence
              </Button>
            </>
          }
        >
          <p>
            This renumbers every scene from 1 upward based on the current
            document order. Locked scenes keep their numbers — others get
            assigned around them with letter suffixes if needed. This can&apos;t
            be undone automatically.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
