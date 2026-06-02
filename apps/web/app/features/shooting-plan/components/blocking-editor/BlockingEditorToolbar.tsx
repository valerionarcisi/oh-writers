import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./BlockingEditorToolbar.module.css";

export type EditorTool = "select" | "wall" | "furniture" | "opening";

interface BlockingEditorToolbarProps {
  activeTool: EditorTool;
  onToolChange: (t: EditorTool) => void;
  snapOn: boolean;
  onSnapToggle: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
}

const TOOLS: { id: EditorTool; labelKey: TranslationKey }[] = [
  { id: "select", labelKey: "shootingPlan.editorToolbar.toolSelect" },
  { id: "wall", labelKey: "shootingPlan.editorToolbar.toolWall" },
  { id: "furniture", labelKey: "shootingPlan.editorToolbar.toolFurniture" },
  { id: "opening", labelKey: "shootingPlan.editorToolbar.toolOpening" },
];

export function BlockingEditorToolbar({
  activeTool,
  onToolChange,
  snapOn,
  onSnapToggle,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
}: BlockingEditorToolbarProps) {
  const { t } = useTranslation();
  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="Blocking editor tools"
    >
      <button
        type="button"
        className={styles.closeBtn}
        onClick={onClose}
      >
        {t("shootingPlan.editorToolbar.close")}
      </button>
      <div className={styles.divider} />
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={styles.toolBtn}
          data-active={activeTool === tool.id || undefined}
          onClick={() => onToolChange(tool.id)}
        >
          {t(tool.labelKey)}
        </button>
      ))}
      <div className={styles.divider} />
      <button
        type="button"
        className={styles.toolBtn}
        data-active={snapOn || undefined}
        onClick={onSnapToggle}
      >
        Grid {snapOn ? "ON" : "OFF"}
      </button>
      <button
        type="button"
        className={styles.toolBtn}
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo (⌘Z)"
      >
        ⌘Z
      </button>
      <button
        type="button"
        className={styles.toolBtn}
        disabled={!canRedo}
        onClick={onRedo}
        title="Redo (⌘⇧Z)"
      >
        ⌘⇧Z
      </button>
    </div>
  );
}
