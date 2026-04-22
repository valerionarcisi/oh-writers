import { Button, Dialog } from "@oh-writers/ui";

interface ImportedTitlePageConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks the writer whether to apply a title page extracted from a just-imported
 * PDF. Rendered only when Pass 0 detected one AND the project already has a
 * non-empty front page (so we don't silently overwrite).
 *
 * Built on the design-system <Dialog> so backdrop click, ESC and focus
 * trapping come from the platform <dialog> element instead of bespoke markup.
 */
export function ImportedTitlePageConfirm({
  onConfirm,
  onCancel,
}: ImportedTitlePageConfirmProps) {
  return (
    <Dialog
      isOpen
      onClose={onCancel}
      title="Frontespizio importato dal PDF"
      actions={
        <>
          <Button
            variant="ghost"
            onClick={onCancel}
            data-testid="imported-titlepage-confirm-cancel"
          >
            Annulla
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            data-testid="imported-titlepage-confirm-confirm"
            autoFocus
          >
            Sostituisci
          </Button>
        </>
      }
    >
      <p data-testid="imported-titlepage-confirm">
        Vuoi sostituire il frontespizio attuale con quello estratto dal PDF
        importato?
      </p>
    </Dialog>
  );
}
