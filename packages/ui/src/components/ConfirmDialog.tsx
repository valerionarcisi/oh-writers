import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  /** When set, the dialog asks for a value instead of a yes/no. */
  readonly input?: {
    readonly label: string;
    readonly initialValue?: string;
    readonly placeholder?: string;
  };
  /** Carries the typed value when `input` is set; empty string otherwise. */
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
  /** Stable E2E hook forwarded to the underlying <dialog>. */
  readonly testId?: string;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  destructive = false,
  input,
  onConfirm,
  onCancel,
  testId,
}: ConfirmDialogProps) {
  const [value, setValue] = useState(input?.initialValue ?? "");
  const fieldRef = useRef<HTMLInputElement>(null);

  // Each opening starts from the caller's initial value, and the field — not
  // the confirm button — takes focus, so the dialog behaves like the native
  // prompt it replaces.
  useEffect(() => {
    if (!isOpen || !input) return;
    setValue(input.initialValue ?? "");
    const id = requestAnimationFrame(() => {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, input]);

  const trimmed = value.trim();
  const canConfirm = !input || trimmed.length > 0;

  // A closed native <dialog> keeps its children in the DOM, so every mounted
  // ConfirmDialog left a hidden copy of these buttons behind — and the app
  // mounts several (the provider, plus the session-delete and import dialogs).
  // An unscoped getByTestId("confirm-dialog-confirm-btn") then matches an
  // invisible one. Rendering nothing while closed keeps exactly one addressable
  // set of buttons in the document.
  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      isDismissable={false}
      data-testid={testId}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={onCancel}
            data-testid="confirm-dialog-cancel-btn"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={() => onConfirm(trimmed)}
            disabled={!canConfirm}
            // `Dialog` re-runs focus itself once the native <dialog> is
            // genuinely open (React's own `autoFocus` fires too early —
            // before `showModal()` — and silently no-ops); `data-autofocus`
            // is what it looks for, since React never reflects `autoFocus`
            // as a DOM attribute a selector could find.
            {...(!input ? { "data-autofocus": true } : {})}
            data-testid="confirm-dialog-confirm-btn"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
      {input && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{input.label}</span>
          <input
            ref={fieldRef}
            type="text"
            className={styles.fieldInput}
            value={value}
            placeholder={input.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !canConfirm) return;
              e.preventDefault();
              onConfirm(trimmed);
            }}
            data-testid="confirm-dialog-input"
          />
        </label>
      )}
    </Dialog>
  );
}
