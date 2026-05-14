import { useEffect, useRef } from "react";
import type { ShotView, ScenarioView } from "../server/shooting-plan.server";
import styles from "./ShotContextMenu.module.css";

interface ShotContextMenuProps {
  shot: ShotView;
  otherScenarios: ScenarioView[];
  position: { x: number; y: number };
  canAddReverse: boolean;
  onDuplicate: () => void;
  onAddReverse: () => void;
  onMoveTo: (targetScenarioId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ShotContextMenu({
  shot: _shot,
  otherScenarios,
  position,
  canAddReverse,
  onDuplicate,
  onAddReverse,
  onMoveTo,
  onDelete,
  onClose,
}: ShotContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ insetInlineStart: position.x, insetBlockStart: position.y }}
      role="menu"
    >
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        <span>📋 Duplica</span>
        <span className={styles.shortcut}>⌘D</span>
      </button>
      <button
        type="button"
        className={styles.item}
        disabled={!canAddReverse}
        title={
          canAddReverse
            ? "Crea lo specchio dello shot per il personaggio opposto"
            : "Disponibile solo per OTS o MS in scene a 2 personaggi"
        }
        onClick={() => {
          if (canAddReverse) {
            onAddReverse();
            onClose();
          }
        }}
      >
        ↔ Aggiungi controcampo
      </button>

      {otherScenarios.length > 0 && (
        <>
          <div className={styles.divider} />
          {otherScenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.item}
              onClick={() => {
                onMoveTo(s.id);
                onClose();
              }}
            >
              → Sposta a {s.name}
            </button>
          ))}
        </>
      )}

      <div className={styles.divider} />
      <button
        type="button"
        className={styles.itemDanger}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <span>🗑 Elimina</span>
        <span className={styles.shortcut}>⌫</span>
      </button>
    </div>
  );
}
