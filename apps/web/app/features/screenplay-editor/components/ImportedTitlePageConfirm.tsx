import { Button, Dialog } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";

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
  const { t } = useTranslation();
  return (
    <Dialog
      isOpen
      onClose={onCancel}
      title={t("screenplay.titlePage.confirmTitle")}
      isDismissable={false}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={onCancel}
            data-testid="imported-titlepage-confirm-cancel"
          >
            {t("screenplay.titlePage.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            data-testid="imported-titlepage-confirm-confirm"
            autoFocus
          >
            {t("screenplay.titlePage.replace")}
          </Button>
        </>
      }
    >
      <p data-testid="imported-titlepage-confirm">
        {t("screenplay.titlePage.confirmBody")}
      </p>
    </Dialog>
  );
}
