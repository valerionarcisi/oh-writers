import { Link } from "@tanstack/react-router";
import { SaveStatus } from "~/features/documents";
import { VersionsMenu } from "~/features/documents/components/VersionsMenu";
import { ImportPdfButton } from "./ImportPdfButton";
import type { ElementType } from "../lib/fountain-element-detector";
import {
  useVersions,
  useCreateVersionFromScratch,
  useDuplicateScreenplayVersion,
  useRenameScreenplayVersion,
  useSwitchToVersion,
  useDeleteVersion,
} from "../hooks/useVersions";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayToolbarProps {
  projectId: string;
  screenplayId: string;
  currentVersionId: string | null;
  currentPage: number;
  totalPages: number;
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  isFocusMode: boolean;
  hasContent: boolean;
  currentElement: ElementType;
  onSetElement: (element: ElementType) => void;
  onToggleFocusMode: () => void;
  onImport: (fountain: string) => void;
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
  screenplayId,
  currentVersionId,
  currentPage,
  totalPages,
  isDirty,
  isSaving,
  isError,
  isFocusMode,
  hasContent,
  currentElement,
  onSetElement,
  onToggleFocusMode,
  onImport,
}: ScreenplayToolbarProps) {
  const versionsQuery = useVersions(screenplayId);
  const createVersion = useCreateVersionFromScratch(screenplayId);
  const duplicateVersion = useDuplicateScreenplayVersion(screenplayId);
  const renameVersion = useRenameScreenplayVersion(screenplayId);
  const switchVersion = useSwitchToVersion(screenplayId);
  const deleteVersion = useDeleteVersion(screenplayId);
  const versions =
    versionsQuery.data && versionsQuery.data.isOk
      ? versionsQuery.data.value
      : [];
  const isVersionBusy =
    createVersion.isPending ||
    duplicateVersion.isPending ||
    renameVersion.isPending ||
    switchVersion.isPending ||
    deleteVersion.isPending;
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
        <SaveStatus isDirty={isDirty} isSaving={isSaving} isError={isError} />
        <VersionsMenu
          versions={versions}
          currentVersionId={currentVersionId}
          canEdit={true}
          isBusy={isVersionBusy}
          onSwitch={(id) => switchVersion.mutate(id)}
          onRename={(id, label) =>
            renameVersion.mutate({ versionId: id, label })
          }
          onDelete={(id) => deleteVersion.mutate({ versionId: id })}
          onCreateFromScratch={() => createVersion.mutate()}
          onDuplicateCurrent={() => {
            if (currentVersionId) duplicateVersion.mutate(currentVersionId);
          }}
        />
        <button
          className={`${styles.focusBtn} ${isFocusMode ? styles.focusBtnActive : ""}`}
          onClick={onToggleFocusMode}
          type="button"
          title="Toggle focus mode (Ctrl+Shift+F)"
          aria-pressed={isFocusMode}
        >
          Focus
        </button>
        <ImportPdfButton hasExistingContent={hasContent} onImport={onImport} />
        <button
          className={styles.exportBtn}
          type="button"
          disabled
          title="Coming in Spec 08"
        >
          Export PDF
        </button>
      </div>
    </div>
  );
}
