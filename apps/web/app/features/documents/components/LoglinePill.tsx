import { useRef, useState } from "react";
import { Popover } from "@oh-writers/ui";
import { LOGLINE_MAX } from "../documents.schema";
import styles from "./LoglinePill.module.css";

export interface LoglinePillProps {
  readonly projectId: string;
  readonly logline: string;
  readonly canEdit: boolean;
  readonly onChange?: (next: string) => void;
}

const PLACEHOLDER = "Aggiungi una logline per inquadrare il progetto.";

export function LoglinePill({
  projectId: _projectId,
  logline,
  canEdit,
  onChange,
}: LoglinePillProps) {
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
    : "Nessuna logline";

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
        aria-label={hasLogline ? `Logline: ${trimmed}` : "Apri logline"}
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
        placement="bottom-start"
        width={480}
        className={styles.popover}
      >
        <p className={styles.popHead}>Logline</p>
        {canEdit && onChange !== undefined ? (
          <>
            <textarea
              className={styles.editor}
              value={logline}
              maxLength={LOGLINE_MAX}
              onChange={(e) => onChange(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={4}
              data-testid="narrative-logline-editor"
            />
            <p className={styles.counter}>
              {logline.length} / {LOGLINE_MAX}
            </p>
          </>
        ) : (
          <p className={styles.readonly}>
            {hasLogline ? trimmed : PLACEHOLDER}
          </p>
        )}
      </Popover>
    </div>
  );
}
