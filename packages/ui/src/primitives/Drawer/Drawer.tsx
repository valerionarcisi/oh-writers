import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Drawer.module.css";

export type DrawerSide = "left" | "right";

export type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  side?: DrawerSide;
  width?: number | string;
  children: ReactNode;
};

export function Drawer({
  isOpen,
  onClose,
  title,
  side = "right",
  width = 480,
  children,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
    } else if (!isOpen && el.open) {
      el.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={[styles.drawer, side === "left" ? styles.left : ""]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--drawer-width":
            typeof width === "number" ? `${width}px` : width,
        } as React.CSSProperties
      }
      aria-labelledby={titleId}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Chiudi"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
