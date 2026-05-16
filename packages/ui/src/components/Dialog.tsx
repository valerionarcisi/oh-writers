import { useEffect, useId, useRef, type ReactNode } from "react";
import { FocusScope, useDialog, useOverlay, usePreventScroll } from "react-aria";
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
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Keep the native <dialog> in sync for showModal() / ::backdrop support.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Bridge native ESC ("cancel" event) to onClose so react-aria and the native
  // dialog agree on who handles the keyboard dismiss. react-aria also fires onClose
  // on ESC via useOverlay — preventDefault prevents the native close from double-firing.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  // react-aria scroll prevention (harmless alongside native showModal scroll lock).
  usePreventScroll({ isDisabled: !isOpen });

  // useOverlay provides ESC dismiss and click-outside dismiss on the content element.
  const { overlayProps } = useOverlay(
    { isOpen, onClose, isDismissable: true, isKeyboardDismissDisabled: false },
    contentRef,
  );

  // useDialog provides role="dialog", aria-labelledby, and other ARIA semantics.
  const { dialogProps } = useDialog({ "aria-labelledby": titleId }, contentRef);

  const classes = [styles.dialog, styles[`size-${size}`], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={dialogRef}
      id={id}
      data-testid={testId}
      className={classes}
      // Clicks that land directly on <dialog> (outside .content) are backdrop clicks.
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
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
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
          {actions ? (
            <footer className={styles.actions}>{actions}</footer>
          ) : null}
        </div>
      </FocusScope>
    </dialog>
  );
}
