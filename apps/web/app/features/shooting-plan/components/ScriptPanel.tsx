import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { updateSceneNotes } from "../server/shooting-plan.server";
import styles from "./ScriptPanel.module.css";

interface ScriptPanelProps {
  sceneId: string;
  projectId: string;
  sceneNumber: number;
  sceneHeading: string;
  sceneNotes: string | null;
  storageKey: string;
  onJumpToScreenplay?: () => void;
}

export function ScriptPanel({
  sceneId,
  projectId,
  sceneNumber,
  sceneHeading,
  sceneNotes,
  storageKey,
  onJumpToScreenplay,
}: ScriptPanelProps) {
  const [isOpen, setIsOpen] = useLocalStorage<boolean>(storageKey, false);
  const [draft, setDraft] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: (notes: string | null) =>
      updateSceneNotes({ data: { sceneId, notes } }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["shooting-plan", "scenes", projectId] }),
  });

  const handleChange = useCallback((value: string) => {
    setDraft(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMut.mutate(value.trim().length > 0 ? value : null);
    }, 800);
  }, [saveMut]);

  const currentNotes = draft ?? sceneNotes ?? "";

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
        <textarea
          className={styles.notesTextarea}
          value={currentNotes}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Aggiungi note di scena…"
          rows={6}
        />
      </div>

      <footer className={styles.footer}>
        {saveMut.isPending ? "salvataggio…" : "note di scena"}
      </footer>
    </aside>
  );
}
