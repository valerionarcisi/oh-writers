import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  FocusScope,
  useDialog,
  useOverlay,
  usePreventScroll,
} from "react-aria";
import styles from "./Modal.module.css";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Keep the native <dialog> in sync for showModal() / ::backdrop support.
  // The visual layer (backdrop blur, panel-in animation) is driven by the
  // native dialog's [open] + ::backdrop styles, so it stays here; only the
  // hand-rolled focus/keyboard/dismiss logic moves to react-aria below.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Bridge the native ESC ("cancel" event) to onClose so the native dialog and
  // react-aria's useOverlay agree on the keyboard dismiss; preventDefault stops
  // the native close from double-firing.
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

  // Honour initialFocusRef: FocusScope's autoFocus targets the first tabbable
  // node, so when a specific node is requested we move focus to it after mount.
  useEffect(() => {
    if (isOpen) initialFocusRef?.current?.focus();
  }, [isOpen, initialFocusRef]);

  // react-aria scroll lock (harmless alongside native showModal scroll lock).
  usePreventScroll({ isDisabled: !isOpen });

  // useOverlay provides ESC dismiss and click-outside dismiss on the content.
  const { overlayProps } = useOverlay(
    { isOpen, onClose, isDismissable: true, isKeyboardDismissDisabled: false },
    contentRef,
  );

  // useDialog provides role="dialog"; aria-labelledby/aria-describedby point to
  // the title/description ids set manually on the markup below.
  const { dialogProps } = useDialog(
    {
      "aria-labelledby": titleId,
      "aria-describedby": description ? descId : undefined,
    },
    contentRef,
  );

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-size={size}
      // Clicks landing directly on <dialog> (outside the content) are backdrop
      // clicks; useOverlay handles dismissal but the native dialog also captures
      // these, so mirror the close to keep both layers in agreement.
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
            {description ? (
              <p id={descId} className={styles.description}>
                {description}
              </p>
            ) : null}
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      </FocusScope>
    </dialog>
  );
}
