import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

type DialogSize = "sm" | "md" | "lg" | "xl";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  /**
   * Maximum inline-size of the dialog. Defaults to "md" (≈480px).
   * Use "xl" for content-heavy dialogs like side-by-side diffs.
   */
  size?: DialogSize;
  /**
   * When true, shows an accessible × close button in the header.
   * Use for "options" dialogs where dismiss is non-destructive.
   */
  showCloseButton?: boolean;
  /** Optional id for the dialog element (forwarded as `id` on <dialog>). */
  id?: string;
  /** Optional data-testid forwarded to the underlying <dialog>. */
  "data-testid"?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  actions,
  className,
  size = "md",
  showCloseButton = false,
  id,
  "data-testid": testId,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  const classes = [styles.dialog, styles[`size-${size}`], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={dialogRef}
      id={id}
      data-testid={testId}
      className={classes}
      onClick={handleBackdropClick}
    >
      <div className={styles.content}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {showCloseButton ? (
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Close"
              data-testid="dialog-close"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </header>
        <div className={styles.body}>{children}</div>
        {actions ? <footer className={styles.actions}>{actions}</footer> : null}
      </div>
    </dialog>
  );
}
