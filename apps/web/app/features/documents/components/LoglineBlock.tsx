import { useState } from "react";
import { match, P } from "ts-pattern";
import { InlineGenerateButton } from "@oh-writers/ui";
import { useMenuPopover } from "~/features/screenplay-editor/hooks/useMenuPopover";
import { useExtractLoglineFromSubject } from "../hooks/useExtractLoglineFromSubject";
import styles from "./LoglineBlock.module.css";

const MAX_LENGTH = 500;
const COUNTER_WARN_THRESHOLD = 450;

export interface LoglineBlockLabels {
  readonly heading: string;
  readonly extract: string;
  readonly extracting: string;
  readonly accept: string;
  readonly reject: string;
  readonly placeholder: string;
  readonly counter: (used: number, max: number) => string;
  readonly rateLimited: string;
}

// IT is the default runtime language (Spec 04f).
const defaultLabels: LoglineBlockLabels = {
  heading: "Logline",
  extract: "Estrai dal soggetto",
  extracting: "Estrazione\u2026",
  accept: "Accetta",
  reject: "Rifiuta",
  placeholder:
    "Un [protagonista] deve [obiettivo] prima di [posta in gioco]\u2026",
  counter: (used, max) => `${used} / ${max}`,
  rateLimited: "Cesare sta prendendo fiato \u2014 riprova tra un istante.",
};

export interface LoglineBlockProps {
  readonly projectId: string;
  readonly logline: string | null;
  readonly canEdit: boolean;
  readonly onChange: (next: string) => void;
  readonly labels?: Partial<LoglineBlockLabels>;
  readonly testId?: string;
}

type PopoverState =
  | { readonly kind: "suggestion"; readonly text: string }
  | { readonly kind: "error"; readonly message: string };

export function LoglineBlock({
  projectId,
  logline,
  canEdit,
  onChange,
  labels,
  testId,
}: LoglineBlockProps) {
  const l: LoglineBlockLabels = { ...defaultLabels, ...labels };
  const value = logline ?? "";
  const used = value.length;

  const extract = useExtractLoglineFromSubject();
  const { isOpen, open, close, panelRef } = useMenuPopover();
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const onExtract = async () => {
    const outcome = await extract
      .mutateAsync({ projectId })
      .then((value) => ({ ok: true as const, value }))
      .catch((error: unknown) => ({ ok: false as const, error }));

    const next: PopoverState = match(outcome)
      .with({ ok: true }, ({ value }) => ({
        kind: "suggestion" as const,
        text: value.logline,
      }))
      .with({ ok: false, error: { _tag: "RateLimitedError" } }, () => ({
        kind: "error" as const,
        message: l.rateLimited,
      }))
      .with({ ok: false, error: P.any }, () => ({
        kind: "error" as const,
        message: "Impossibile estrarre la logline.",
      }))
      .exhaustive();

    setPopover(next);
    open();
  };

  const accept = () => {
    if (popover?.kind !== "suggestion") return;
    onChange(popover.text.slice(0, MAX_LENGTH));
    setPopover(null);
    close();
  };

  const reject = () => {
    setPopover(null);
    close();
  };

  const counterClass =
    used > COUNTER_WARN_THRESHOLD
      ? `${styles.counter} ${styles.counterWarn}`
      : styles.counter;

  return (
    <div className={styles.root} data-testid={testId}>
      <div className={styles.header}>
        <h2 className={styles.heading}>{l.heading}</h2>
        {canEdit && (
          <InlineGenerateButton
            label={extract.isPending ? l.extracting : l.extract}
            isLoading={extract.isPending}
            onClick={() => void onExtract()}
            testId="logline-extract"
          />
        )}
      </div>

      <div className={styles.textareaWrapper}>
        <textarea
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={l.placeholder}
          maxLength={MAX_LENGTH}
          readOnly={!canEdit}
          rows={3}
          data-testid="logline-textarea"
        />
      </div>

      <div className={styles.footer}>
        <span className={counterClass} data-testid="logline-counter">
          {l.counter(used, MAX_LENGTH)}
        </span>
      </div>

      {isOpen && popover && (
        <div
          ref={panelRef}
          className={styles.popover}
          role="dialog"
          aria-label={l.heading}
          data-testid="logline-popover"
        >
          {popover.kind === "suggestion" ? (
            <>
              <p className={styles.popoverText}>{popover.text}</p>
              <div className={styles.popoverActions}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={reject}
                  data-testid="logline-popover-reject"
                >
                  {l.reject}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={accept}
                  data-testid="logline-popover-accept"
                >
                  {l.accept}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.popoverError} role="alert">
                {popover.message}
              </p>
              <div className={styles.popoverActions}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={reject}
                  data-testid="logline-popover-dismiss"
                >
                  {l.reject}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
