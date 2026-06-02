import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
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
  onConfirm,
  onCancel,
  testId,
}: ConfirmDialogProps) {
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
            onClick={onConfirm}
            autoFocus
            data-testid="confirm-dialog-confirm-btn"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Dialog>
  );
}
