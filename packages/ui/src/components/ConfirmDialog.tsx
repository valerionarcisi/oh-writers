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
}: ConfirmDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            autoFocus
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
