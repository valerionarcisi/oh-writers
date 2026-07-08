import { useRef, useState } from "react";
import { Button, CopyButton, Popover } from "@oh-writers/ui";
import { LOGLINE_MAX } from "../documents.schema";
import { useTranslation } from "~/features/i18n";
import styles from "./LoglinePill.module.css";

export interface LoglinePillProps {
  readonly projectId: string;
  readonly logline: string;
  readonly canEdit: boolean;
  readonly onChange?: (next: string) => void;
  /** Persist the current logline immediately (manual save). */
  readonly onSave?: () => void;
  /** Unsaved edits pending. Enables the Save button. */
  readonly isDirty?: boolean;
  /** A save is in flight — disables the Save button and shows progress. */
  readonly isSaving?: boolean;
}

export function LoglinePill({
  projectId: _projectId,
  logline,
  canEdit,
  onChange,
  onSave,
  isDirty = false,
  isSaving = false,
}: LoglinePillProps) {
  const { t } = useTranslation();
  const placeholder = t("documents.logline.placeholder");
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trimmed = logline.trim();
  const hasLogline = trimmed.length > 0;
  // The unused projectId argument keeps the API consistent for a future
  // editor that may need to issue mutations referencing the project.
  void _projectId;

  const display = hasLogline
    ? trimmed.length > 90
      ? `${trimmed.slice(0, 87)}…`
      : trimmed
    : t("documents.logline.empty");

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.pill}
        data-empty={hasLogline ? undefined : "true"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={
          hasLogline
            ? t("documents.logline.loglineAria").replace("{logline}", trimmed)
            : t("documents.logline.openAria")
        }
        data-testid="narrative-logline-pill"
      >
        <span className={styles.pin} aria-hidden="true">
          ★
        </span>
        <span className={styles.text}>{display}</span>
      </button>
      <Popover
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement="bottom-start"
        width={480}
        className={styles.popover}
      >
        <div className={styles.popHeadRow}>
          <p className={styles.popHead}>{t("documents.logline.heading")}</p>
          {hasLogline && (
            <CopyButton
              getText={() => trimmed}
              data-testid="narrative-logline-copy"
            />
          )}
        </div>
        {canEdit && onChange !== undefined ? (
          <>
            <textarea
              className={styles.editor}
              value={logline}
              maxLength={LOGLINE_MAX}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={4}
              data-testid="narrative-logline-editor"
            />
            <div className={styles.footer}>
              <span className={styles.counter}>
                {logline.length} / {LOGLINE_MAX}
              </span>
              {onSave !== undefined && (
                <Button
                  variant="primary"
                  size="sm"
                  onPress={onSave}
                  disabled={!isDirty || isSaving}
                  data-testid="narrative-logline-save"
                >
                  {isSaving
                    ? t("documents.logline.saving")
                    : t("documents.logline.save")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className={styles.readonly}>
            {hasLogline ? trimmed : placeholder}
          </p>
        )}
      </Popover>
    </div>
  );
}
