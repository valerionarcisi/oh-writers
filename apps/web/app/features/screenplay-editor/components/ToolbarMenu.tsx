import { useMenuPopover } from "../hooks/useMenuPopover";
import { useImportPdf } from "../hooks/useImportPdf";
import styles from "./ToolbarMenu.module.css";

interface ToolbarMenuProps {
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
  hasContent,
  onImport,
  nextVersionLabel,
  onCreateVersionThenImport,
  onToggleVersions,
  isVersionsPanelOpen,
  currentVersionLabel = null,
  onResequenceAll,
}: ToolbarMenuProps) {
  const { isOpen, toggle, close, triggerRef, panelRef } = useMenuPopover();
  const imp = useImportPdf({
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

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            disabled
            title="Disponibile a breve"
            data-testid="menu-item-title-page"
          >
            <span className={styles.itemIcon} aria-hidden="true">
              ✎
            </span>
            <span className={styles.itemLabel}>Frontespizio</span>
            <span className={styles.comingSoon}>soon</span>
          </button>
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
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-confirm-title"
          aria-describedby="import-confirm-body"
          data-testid="import-confirm"
          onClick={imp.cancel}
          onKeyDown={(e) => {
            if (e.key === "Escape") imp.cancel();
          }}
        >
          <div
            className={styles.confirmBox}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="import-confirm-title" className={styles.confirmTitle}>
              Importa PDF
            </h2>
            <p id="import-confirm-body" className={styles.confirmText}>
              {nextVersionLabel && onCreateVersionThenImport
                ? "La sceneggiatura attuale verrà sostituita dal contenuto importato. Puoi prima salvarla come nuova versione, così non perdi nulla."
                : "Sostituire la sceneggiatura attuale con il contenuto importato?"}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={imp.cancel}
                data-testid="import-confirm-cancel"
              >
                Annulla
              </button>
              {nextVersionLabel && onCreateVersionThenImport ? (
                <>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={imp.confirm}
                    data-testid="import-confirm-overwrite"
                  >
                    Sovrascrivi
                  </button>
                  <button
                    type="button"
                    className={styles.confirmBtn}
                    onClick={imp.confirmWithVersion}
                    data-testid="import-confirm-new-version"
                    autoFocus
                  >
                    Salva come {nextVersionLabel} e importa
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={imp.confirm}
                  data-testid="import-confirm-ok"
                  autoFocus
                >
                  Sostituisci
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
