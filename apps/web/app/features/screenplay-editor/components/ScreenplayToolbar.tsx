import { Link } from "@tanstack/react-router";
import { SaveIndicator } from "./SaveIndicator";
import { ToolbarMenu } from "./ToolbarMenu";
import type { ElementType } from "../lib/fountain-element-detector";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayToolbarProps {
  projectId: string;
  currentPage: number;
  totalPages: number;
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
}: ScreenplayToolbarProps) {
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
        {currentVersionLabel != null && (
          <button
            type="button"
            className={`${styles.versionBadge} ${isVersionsPanelOpen ? styles.versionBadgeActive : ""}`}
            onClick={onToggleVersions}
            title="Gestisci versioni"
            data-testid="current-version-badge"
          >
            {currentVersionLabel}
          </button>
        )}
        <ToolbarMenu
          hasContent={hasContent}
          onImport={onImport}
          nextVersionLabel={nextVersionLabel}
          onCreateVersionThenImport={onCreateVersionThenImport}
          onToggleVersions={onToggleVersions}
          isVersionsPanelOpen={isVersionsPanelOpen}
        />
      </div>
    </div>
  );
}
