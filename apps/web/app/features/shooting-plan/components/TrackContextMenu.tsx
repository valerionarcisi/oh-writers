import { useEffect, useRef } from "react";
import { useTranslation } from "~/features/i18n";
import styles from "./ShotContextMenu.module.css";

interface TrackContextMenuProps {
  position: { x: number; y: number };
  onCompact: () => void;
  onClose: () => void;
}

export function TrackContextMenu({
  position,
  onCompact,
  onClose,
}: TrackContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
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
          onCompact();
          onClose();
        }}
      >
        {t("shootingPlan.trackMenu.removeGaps")}
      </button>
    </div>
  );
}
