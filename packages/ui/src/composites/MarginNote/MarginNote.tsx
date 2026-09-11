// packages/ui/src/composites/MarginNote/MarginNote.tsx
import styles from "./MarginNote.module.css";

export type MarginNoteKind = "dramaturg" | "producer";

export type MarginNoteProps = {
  kind: MarginNoteKind;
  text: string;
  onAccept?: () => void;
  onIgnore?: () => void;
  /** Aria-label for the accept button (defaults to EN). */
  acceptLabel?: string;
  /** Aria-label for the ignore button (defaults to EN). */
  ignoreLabel?: string;
};

const kindLabels: Record<MarginNoteKind, string> = {
  dramaturg: "Writing",
  producer: "Production",
};

export function MarginNote({
  kind,
  text,
  onAccept,
  onIgnore,
  acceptLabel = "Accept Cesare's suggestion",
  ignoreLabel = "Ignore Cesare's suggestion",
}: MarginNoteProps) {
  const isProducer = kind === "producer";

  return (
    <aside
      className={[styles.note, isProducer ? styles.noteProducer : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Nota Cesare — ${kindLabels[kind]}`}
    >
      <span
        className={[styles.kind, isProducer ? styles.kindProducer : ""]
          .filter(Boolean)
          .join(" ")}
      >
        <span className={styles.star} aria-hidden="true">
          ✦
        </span>{" "}
        {kindLabels[kind]}
      </span>
      <p className={styles.text}>{text}</p>
      {(onAccept || onIgnore) && (
        <div className={styles.actions}>
          {onAccept && (
            <button
              type="button"
              className={[styles.actionBtn, styles.accept].join(" ")}
              onClick={onAccept}
              aria-label={acceptLabel}
            >
              Accetta
            </button>
          )}
          {onIgnore && (
            <button
              type="button"
              className={[styles.actionBtn, styles.ignore].join(" ")}
              onClick={onIgnore}
              aria-label={ignoreLabel}
            >
              Ignora
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
