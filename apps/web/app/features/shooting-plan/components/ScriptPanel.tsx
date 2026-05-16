import { useLocalStorage } from "../hooks/useLocalStorage";
import styles from "./ScriptPanel.module.css";

interface ScriptPanelProps {
  sceneNumber: number;
  sceneHeading: string;
  sceneNotes: string | null;
  storageKey: string;
  onJumpToScreenplay?: () => void;
}

export function ScriptPanel({
  sceneNumber,
  sceneHeading,
  sceneNotes,
  storageKey,
  onJumpToScreenplay,
}: ScriptPanelProps) {
  const [isOpen, setIsOpen] = useLocalStorage<boolean>(storageKey, false);

  if (!isOpen) {
    return (
      <button
        type="button"
        className={styles.collapsedTab}
        onClick={() => setIsOpen(true)}
        aria-label="Apri pannello sceneggiatura"
      >
        <span className={styles.collapsedIcon}>📄</span>
        <span className={styles.collapsedLabel}>SCENA ▶</span>
      </button>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Pannello sceneggiatura">
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          📄 Scena {sceneNumber} — testo
        </div>
        <div className={styles.headerActions}>
          {onJumpToScreenplay && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onJumpToScreenplay}
              title="Apri nello Screenplay editor"
            >
              ↗
            </button>
          )}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsOpen(false)}
            aria-label="Chiudi pannello"
          >
            ◀
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.sceneHeading}>{sceneHeading}</div>
        {sceneNotes ? (
          <div className={styles.notes}>{sceneNotes}</div>
        ) : (
          <p className={styles.empty}>
            Nessuna nota di scena. Apri lo Screenplay editor per il testo completo.
          </p>
        )}
      </div>

      <footer className={styles.footer}>
        <span>read-only</span>
      </footer>
    </aside>
  );
}
