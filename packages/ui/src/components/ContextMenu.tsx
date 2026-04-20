import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  open: boolean;
  anchor: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  "data-testid"?: string;
}

export function ContextMenu({
  open,
  anchor,
  items,
  onClose,
  ...rest
}: ContextMenuProps) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <ul
      ref={ref}
      role="menu"
      className={styles.menu}
      style={{ top: anchor.y, left: anchor.x }}
      data-testid={rest["data-testid"]}
    >
      {items.map((item) => (
        <li key={item.label} role="none">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && (
              <span className={styles.icon} aria-hidden>
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
