import { useNavigate } from "@tanstack/react-router";
import { Button, Dialog } from "@oh-writers/ui";
import { useMenuPopover } from "../hooks/useMenuPopover";
import { useImportPdf } from "../hooks/useImportPdf";
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
}: ToolbarMenuProps) {
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

      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Screenplay actions"
        title="Screenplay actions"
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
          aria-label="Screenplay actions"
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
            <span className={styles.itemLabel}>Import PDF</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            disabled
            title="Disponibile a breve"
            data-testid="menu-item-export-pdf"
          >
            <span className={styles.itemIcon} aria-hidden="true">
              ⇩
            </span>
            <span className={styles.itemLabel}>Export PDF</span>
            <span className={styles.comingSoon}>soon</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            disabled={!onResequenceAll}
            title={
              onResequenceAll
                ? "Renumber every scene based on document order"
                : "Disponibile a breve"
            }
            onClick={onResequenceAll ? runAndClose(onResequenceAll) : undefined}
            data-testid="menu-item-renumber"
          >
            <span className={styles.itemIcon} aria-hidden="true">
              #
            </span>
            <span className={styles.itemLabel}>
              Ricalcola numerazione scene
            </span>
            {!onResequenceAll && (
              <span className={styles.comingSoon}>soon</span>
            )}
          </button>

          <div className={styles.divider} aria-hidden="true" />

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={runAndClose(onToggleVersions)}
            aria-expanded={isVersionsPanelOpen}
            data-testid="menu-item-versions"
          >
            <span className={styles.itemIcon} aria-hidden="true">
              ⟲
            </span>
            <span className={styles.itemLabel}>Versioni</span>
            {currentVersionLabel && (
              <span className={styles.comingSoon}>{currentVersionLabel}</span>
            )}
          </button>

          {isOwner && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={runAndClose(openTitlePage)}
              title="Apri il frontespizio"
              data-testid="menu-item-title-page"
            >
              <span className={styles.itemIcon} aria-hidden="true">
                ✎
              </span>
              <span className={styles.itemLabel}>Frontespizio</span>
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
          title="Importa PDF"
          data-testid="import-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={imp.cancel}
                data-testid="import-confirm-cancel"
              >
                Annulla
              </Button>
              {nextVersionLabel && onCreateVersionThenImport ? (
                <>
                  <Button
                    variant="danger"
                    onClick={imp.confirm}
                    data-testid="import-confirm-overwrite"
                  >
                    Sovrascrivi
                  </Button>
                  <Button
                    variant="primary"
                    onClick={imp.confirmWithVersion}
                    data-testid="import-confirm-new-version"
                    autoFocus
                  >
                    Salva come {nextVersionLabel} e importa
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={imp.confirm}
                  data-testid="import-confirm-ok"
                  autoFocus
                >
                  Sostituisci
                </Button>
              )}
            </>
          }
        >
          <p>
            {nextVersionLabel && onCreateVersionThenImport
              ? "La sceneggiatura attuale verrà sostituita dal contenuto importato. Puoi prima salvarla come nuova versione, così non perdi nulla."
              : "Sostituire la sceneggiatura attuale con il contenuto importato?"}
          </p>
        </Dialog>
      )}
    </div>
  );
}
