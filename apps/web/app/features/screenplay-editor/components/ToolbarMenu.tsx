import { useNavigate } from "@tanstack/react-router";
import { Button, Dialog } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import { useMenuPopover } from "../hooks/useMenuPopover";
import { useImportPdf } from "../hooks/useImportPdf";
import { useImportFountain } from "../hooks/useImportFountain";
import type { TitlePageDocJSON } from "../lib/title-page-from-pdf";
import styles from "./ToolbarMenu.module.css";

interface ToolbarMenuProps {
  /** Project id — used to navigate to per-project screens (e.g. Frontespizio). */
  projectId: string;
  hasContent: boolean;
  onImport: (fountain: string) => void;
  /** Label for the "save as new version then import" button, e.g. "Versione 2" */
  nextVersionLabel?: string | null;
  onCreateVersionThenImport?: (fountain: string) => void;
  onToggleVersions: () => void;
  isVersionsPanelOpen: boolean;
  /** Current version label (e.g. "First draft") shown as subtitle on Versioni. */
  currentVersionLabel?: string | null;
  /** Opens the resequence confirmation modal. Hidden when undefined. */
  onResequenceAll?: () => void;
  /** True when the signed-in user owns this project. Gates the Frontespizio
   *  entry, which is Owner-only per spec 07b. */
  isOwner: boolean;
  /** Fires when Pass 0 of the PDF import detected a title page. The parent
   *  decides whether to apply it (potentially showing a replace-confirm). */
  onTitlePageDetected?: (doc: TitlePageDocJSON) => void;
  /**
   * When provided, adds an "Esporta Fountain" item to the menu that triggers a
   * client-side `.fountain` file download. The callback is responsible for
   * initiating the download so the toolbar stays pure UI.
   */
  onExportFountain?: () => void;
}

/**
 * Top-right actions menu for the screenplay editor.
 *
 * Owns the popover shell and the side-effects for each entry:
 *   - Import PDF  (wired via useImportPdf)
 *   - Export PDF, Ricalcola numerazione, Frontespizio  (disabled placeholders,
 *     wired by Spec 07 / 08)
 *   - Versioni  (navigates to the versions route)
 */
export function ToolbarMenu({
  projectId,
  hasContent,
  onImport,
  nextVersionLabel,
  onCreateVersionThenImport,
  onToggleVersions,
  isVersionsPanelOpen,
  currentVersionLabel = null,
  onResequenceAll,
  isOwner,
  onTitlePageDetected,
  onExportFountain,
}: ToolbarMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openTitlePage = () =>
    void navigate({
      to: "/projects/$id/title-page",
      params: { id: projectId },
    });
  const { isOpen, toggle, close, triggerRef, panelRef } = useMenuPopover();
  const imp = useImportPdf({
    hasExistingContent: hasContent,
    onImport,
    onCreateVersionThenImport,
    onTitlePageDetected,
  });
  const fountainImp = useImportFountain({
    hasExistingContent: hasContent,
    onImport,
    onCreateVersionThenImport,
  });

  const runAndClose = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <div className={styles.wrapper}>
      <input
        {...imp.fileInputProps}
        className={styles.hiddenInput}
        data-testid="pdf-file-input"
      />
      <input
        {...fountainImp.fileInputProps}
        className={styles.hiddenInput}
        data-testid="fountain-file-input"
      />

      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t("screenplay.menu.actionsAria")}
        title={t("screenplay.menu.actionsAria")}
        disabled={imp.isLoading}
        onClick={toggle}
        data-testid="toolbar-menu-trigger"
      >
        {imp.isLoading ? "…" : "⋯"}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={t("screenplay.menu.actionsAria")}
          className={styles.panel}
          data-testid="toolbar-menu-panel"
        >
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={runAndClose(imp.openPicker)}
            data-testid="menu-item-import-pdf"
          >
            <span className={styles.itemIcon} aria-hidden="true">
              ⇪
            </span>
            <span className={styles.itemLabel}>
              {t("screenplay.menu.importPdf")}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={runAndClose(fountainImp.openPicker)}
            data-testid="menu-item-import-fountain"
          >
            <span className={styles.itemIcon} aria-hidden="true">
              ⇪
            </span>
            <span className={styles.itemLabel}>
              {t("screenplay.menu.importFountain")}
            </span>
          </button>

          {onExportFountain && hasContent && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={runAndClose(onExportFountain)}
              data-testid="menu-item-export-fountain"
            >
              <span className={styles.itemIcon} aria-hidden="true">
                ↧
              </span>
              <span className={styles.itemLabel}>
                {t("screenplay.menu.exportFountain")}
              </span>
            </button>
          )}

          {onResequenceAll && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              title={t("screenplay.menu.renumberTitle")}
              onClick={runAndClose(onResequenceAll)}
              data-testid="menu-item-renumber"
            >
              <span className={styles.itemIcon} aria-hidden="true">
                #
              </span>
              <span className={styles.itemLabel}>
                {t("screenplay.menu.recalcSceneNumbers")}
              </span>
            </button>
          )}

          {isOwner && <div className={styles.divider} aria-hidden="true" />}
          {isOwner && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={runAndClose(openTitlePage)}
              title={t("screenplay.menu.titlePageTitle")}
              data-testid="menu-item-title-page"
            >
              <span className={styles.itemIcon} aria-hidden="true">
                ✎
              </span>
              <span className={styles.itemLabel}>
                {t("screenplay.menu.titlePage")}
              </span>
            </button>
          )}
        </div>
      )}

      {imp.status.type === "error" && (
        <div
          className={styles.errorBanner}
          role="alert"
          data-testid="import-error"
        >
          {imp.status.message}
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={imp.cancel}
          >
            ✕
          </button>
        </div>
      )}

      {imp.status.type === "confirm" && (
        <Dialog
          isOpen
          onClose={imp.cancel}
          title={t("screenplay.menu.importPdfTitle")}
          isDismissable={false}
          data-testid="import-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={imp.cancel}
                data-testid="import-confirm-cancel"
              >
                {t("screenplay.menu.cancel")}
              </Button>
              {nextVersionLabel && onCreateVersionThenImport ? (
                <>
                  <Button
                    variant="danger"
                    onClick={imp.confirm}
                    data-testid="import-confirm-overwrite"
                  >
                    {t("screenplay.menu.overwrite")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={imp.confirmWithVersion}
                    data-testid="import-confirm-new-version"
                    autoFocus
                  >
                    {t("screenplay.menu.saveAsPrefix")}
                    {nextVersionLabel}
                    {t("screenplay.menu.saveAsSuffix")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={imp.confirm}
                  data-testid="import-confirm-ok"
                  autoFocus
                >
                  {t("screenplay.menu.replace")}
                </Button>
              )}
            </>
          }
        >
          <p>
            {nextVersionLabel && onCreateVersionThenImport
              ? t("screenplay.menu.confirmWithVersionBody")
              : t("screenplay.menu.confirmReplaceBody")}
          </p>
        </Dialog>
      )}

      {fountainImp.status.type === "error" && (
        <div
          className={styles.errorBanner}
          role="alert"
          data-testid="import-fountain-error"
        >
          {fountainImp.status.message}
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={fountainImp.cancel}
          >
            ✕
          </button>
        </div>
      )}

      {fountainImp.status.type === "confirm" && (
        <Dialog
          isOpen
          onClose={fountainImp.cancel}
          title={t("screenplay.menu.importFountainTitle")}
          isDismissable={false}
          data-testid="import-fountain-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={fountainImp.cancel}
                data-testid="import-fountain-confirm-cancel"
              >
                {t("screenplay.menu.cancel")}
              </Button>
              {nextVersionLabel && onCreateVersionThenImport ? (
                <>
                  <Button
                    variant="danger"
                    onClick={fountainImp.confirm}
                    data-testid="import-fountain-confirm-overwrite"
                  >
                    {t("screenplay.menu.overwrite")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={fountainImp.confirmWithVersion}
                    data-testid="import-fountain-confirm-new-version"
                    autoFocus
                  >
                    {t("screenplay.menu.saveAsPrefix")}
                    {nextVersionLabel}
                    {t("screenplay.menu.saveAsSuffix")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={fountainImp.confirm}
                  data-testid="import-fountain-confirm-ok"
                  autoFocus
                >
                  {t("screenplay.menu.replace")}
                </Button>
              )}
            </>
          }
        >
          <p>
            {nextVersionLabel && onCreateVersionThenImport
              ? t("screenplay.menu.confirmWithVersionBody")
              : t("screenplay.menu.confirmReplaceBody")}
          </p>
        </Dialog>
      )}
    </div>
  );
}
