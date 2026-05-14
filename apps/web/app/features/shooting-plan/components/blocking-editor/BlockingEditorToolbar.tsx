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

const TOOLS: { id: EditorTool; label: string }[] = [
  { id: "select", label: "↖ Seleziona" },
  { id: "wall", label: "▬ Parete" },
  { id: "furniture", label: "□ Mobile" },
  { id: "opening", label: "↔ Apertura" },
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
        aria-label="Chiudi editor"
      >
        ← Chiudi
      </button>
      <div className={styles.divider} />
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={styles.toolBtn}
          data-active={activeTool === t.id || undefined}
          onClick={() => onToolChange(t.id)}
        >
          {t.label}
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
