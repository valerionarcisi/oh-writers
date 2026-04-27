import { useEffect, useRef, useState } from "react";
import styles from "./ExportPdfModal.module.css";

export type ExportFormat = "pdf" | "docx";

export interface ExportGenerateOpts {
  readonly includeTitlePage: boolean;
  readonly format: ExportFormat;
}

interface ExportPdfModalProps {
  /**
   * True only when the project has a title page filled in (i.e. an author
   * is set). When false the cover-page checkbox is rendered disabled with
   * an inline hint explaining why (Spec 04c, OHW-230).
   */
  canIncludeTitlePage: boolean;
  isPending: boolean;
  onClose: () => void;
  onGenerate: (opts: ExportGenerateOpts) => void;
  /**
   * Optional list of formats the caller supports. When omitted or length
   * is 1 the radio group is hidden and the single format is used. Default
   * preserves PDF-only behaviour for legacy callers (screenplay/narrative).
   */
  readonly availableFormats?: ReadonlyArray<ExportFormat>;
  /** Optional custom title; defaults to a format-aware label. */
  readonly title?: string;
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF",
  docx: "Word (.docx)",
};

export function ExportPdfModal({
  canIncludeTitlePage,
  isPending,
  onClose,
  onGenerate,
  availableFormats = ["pdf"],
  title,
}: ExportPdfModalProps) {
  const [includeTitlePage, setIncludeTitlePage] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(
    availableFormats[0] ?? "pdf",
  );
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [onClose]);

  const showFormatPicker = availableFormats.length > 1;
  const resolvedTitle =
    title ??
    (showFormatPicker ? "Export document" : `Export ${FORMAT_LABELS[format]}`);

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      data-testid="narrative-export-modal-overlay"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="narrative-export-modal-title"
        data-testid="narrative-export-modal"
      >
        <div className={styles.header}>
          <h2 id="narrative-export-modal-title" className={styles.title}>
            {resolvedTitle}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          {showFormatPicker && (
            <fieldset
              className={styles.fieldset}
              data-testid="narrative-export-format"
            >
              <legend className={styles.legend}>Format</legend>
              {availableFormats.map((f) => (
                <label key={f} className={styles.checkboxRow}>
                  <input
                    type="radio"
                    name="export-format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    data-testid={`narrative-export-format-${f}`}
                  />
                  <span>{FORMAT_LABELS[f]}</span>
                </label>
              ))}
            </fieldset>
          )}
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              data-testid="narrative-export-include-title-page"
              checked={includeTitlePage && canIncludeTitlePage}
              disabled={!canIncludeTitlePage}
              onChange={(e) => setIncludeTitlePage(e.target.checked)}
            />
            <span>Include title page</span>
          </label>
          {!canIncludeTitlePage && (
            <p className={styles.hint}>
              Fill in the project title page to enable this option.
            </p>
          )}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btn}
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            data-testid="narrative-export-generate"
            disabled={isPending}
            onClick={() =>
              onGenerate({
                includeTitlePage: includeTitlePage && canIncludeTitlePage,
                format,
              })
            }
          >
            {isPending ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
