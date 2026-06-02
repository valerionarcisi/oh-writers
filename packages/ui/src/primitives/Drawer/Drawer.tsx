import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  FocusScope,
  useButton,
  useDialog,
  useOverlay,
  usePreventScroll,
} from "react-aria";
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

function CloseButton({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress: onClose, "aria-label": "Chiudi" },
    ref,
  );
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={styles.closeBtn}
    >
      ×
    </button>
  );
}

export function Drawer({
  isOpen,
  onClose,
  title,
  side = "right",
  width = 480,
  children,
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Keep the native <dialog> in sync for showModal() / ::backdrop + the
  // @starting-style slide-in animation, which all depend on the native
  // [open] state. Only focus/keyboard/dismiss logic moves to react-aria.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
    } else if (!isOpen && el.open) {
      el.close();
    }
  }, [isOpen]);

  // Bridge the native ESC ("cancel" event) to onClose; preventDefault stops the
  // native close from double-firing alongside react-aria's keyboard dismiss.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  usePreventScroll({ isDisabled: !isOpen });

  const { overlayProps } = useOverlay(
    { isOpen, onClose, isDismissable: true, isKeyboardDismissDisabled: false },
    contentRef,
  );

  const { dialogProps } = useDialog({ "aria-labelledby": titleId }, contentRef);

  return (
    <dialog
      ref={dialogRef}
      className={[styles.drawer, side === "left" ? styles.left : ""]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--drawer-width": typeof width === "number" ? `${width}px` : width,
        } as React.CSSProperties
      }
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <FocusScope contain restoreFocus autoFocus>
        <div
          ref={contentRef}
          className={styles.content}
          {...overlayProps}
          {...dialogProps}
        >
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <CloseButton onClose={onClose} />
          </div>
          <div className={styles.body}>{children}</div>
        </div>
      </FocusScope>
    </dialog>
  );
}
