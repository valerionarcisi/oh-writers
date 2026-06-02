import { useEffect, useRef } from "react";
import { useTranslation } from "~/features/i18n";
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
  const { t } = useTranslation();
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
        <span>{t("shootingPlan.shotMenu.duplicate")}</span>
        <span className={styles.shortcut}>⌘D</span>
      </button>
      <button
        type="button"
        className={styles.item}
        disabled={!canAddReverse}
        title={
          canAddReverse
            ? t("shootingPlan.shotMenu.addReverseTitle")
            : t("shootingPlan.shotMenu.addReverseDisabledTitle")
        }
        onClick={() => {
          if (canAddReverse) {
            onAddReverse();
            onClose();
          }
        }}
      >
        {t("shootingPlan.shotMenu.addReverse")}
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
              {t("shootingPlan.shotMenu.moveTo").replace("{name}", s.name)}
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
        <span>{t("shootingPlan.shotMenu.delete")}</span>
        <span className={styles.shortcut}>⌫</span>
      </button>
    </div>
  );
}
