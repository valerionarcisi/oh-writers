// packages/ui/src/composites/MarginNote/MarginNote.tsx
import styles from "./MarginNote.module.css";

export type MarginNoteKind = "dramaturg" | "producer";

export type MarginNoteProps = {
  kind: MarginNoteKind;
  text: string;
  onAccept?: () => void;
  onIgnore?: () => void;
};

const kindLabels: Record<MarginNoteKind, string> = {
  dramaturg: "Scrittura",
  producer: "Produzione",
};

export function MarginNote({ kind, text, onAccept, onIgnore }: MarginNoteProps) {
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
              aria-label="Accetta suggerimento di Cesare"
            >
              Accetta
            </button>
          )}
          {onIgnore && (
            <button
              type="button"
              className={[styles.actionBtn, styles.ignore].join(" ")}
              onClick={onIgnore}
              aria-label="Ignora suggerimento di Cesare"
            >
              Ignora
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
