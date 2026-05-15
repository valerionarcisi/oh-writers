import { useState } from "react";
import { Modal, DsButton } from "@oh-writers/ui";
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

  const showFormatPicker = availableFormats.length > 1;
  const resolvedTitle =
    title ??
    (showFormatPicker ? "Esporta documento" : `Esporta ${FORMAT_LABELS[format]}`);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={resolvedTitle}
      footer={
        <>
          <DsButton
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
          >
            Annulla
          </DsButton>
          <DsButton
            variant="primary"
            data-testid="narrative-export-generate"
            disabled={isPending}
            onClick={() =>
              onGenerate({
                includeTitlePage: includeTitlePage && canIncludeTitlePage,
                format,
              })
            }
          >
            {isPending ? "Generazione…" : "Genera"}
          </DsButton>
        </>
      }
    >
      <div
        className={styles.body}
        data-testid="narrative-export-modal"
      >
        {showFormatPicker && (
          <fieldset
            className={styles.fieldset}
            data-testid="narrative-export-format"
          >
            <legend className={styles.legend}>Formato</legend>
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
          <span>Includi frontespizio</span>
        </label>
        {!canIncludeTitlePage && (
          <p className={styles.hint}>
            Compila il frontespizio del progetto per abilitare questa opzione.
          </p>
        )}
      </div>
    </Modal>
  );
}
