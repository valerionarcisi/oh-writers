import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Popover } from "@oh-writers/ui";
import { DocumentTypes } from "@oh-writers/domain";
import {
  CesareLiveDiff,
  getLiveDiffState,
  subscribeLiveDiff,
} from "~/features/app-shell";
import { LOGLINE_MAX } from "../documents.schema";
import { useTranslation } from "~/features/i18n";
import styles from "./LoglinePill.module.css";

/**
 * The latest live-diff flash nonce for the logline (N-09). The logline lives in
 * a collapsed pill, so unlike the prose documents there is no always-mounted
 * surface to paint the "Mostra modifiche" flash onto. We watch the store here so
 * the pill can auto-open its popover and render the diff when Cesare edits the
 * logline. Returns `null` until the first flash. */
function useLoglineFlashNonce(): number | null {
  const state = useSyncExternalStore(
    subscribeLiveDiff,
    getLiveDiffState,
    getLiveDiffState,
  );
  return state.flashes[DocumentTypes.LOGLINE]?.nonce ?? null;
}

export interface LoglinePillProps {
  readonly projectId: string;
  readonly logline: string;
  readonly canEdit: boolean;
  readonly onChange?: (next: string) => void;
}

export function LoglinePill({
  projectId: _projectId,
  logline,
  canEdit,
  onChange,
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

  // N-09 — when Cesare flashes "Mostra modifiche" for the logline, auto-open the
  // pill popover so the inline diff (`<CesareLiveDiff documentType="logline"/>`)
  // is actually visible. Keyed ONLY on the nonce (a primitive that changes only
  // on a flash request), so this never re-runs per render.
  const flashNonce = useLoglineFlashNonce();
  const shownNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (flashNonce == null) return;
    if (shownNonceRef.current === flashNonce) return;
    shownNonceRef.current = flashNonce;
    setOpen(true);
  }, [flashNonce]);

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
        <p className={styles.popHead}>{t("documents.logline.heading")}</p>
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
            <p className={styles.counter}>
              {logline.length} / {LOGLINE_MAX}
            </p>
          </>
        ) : (
          <p className={styles.readonly}>
            {hasLogline ? trimmed : placeholder}
          </p>
        )}
        {/* Logline diff flash surface (N-09). The pill has no persistent prose
            body, so the flash paints here inside the popover. */}
        <CesareLiveDiff documentType={DocumentTypes.LOGLINE} />
      </Popover>
    </div>
  );
}
