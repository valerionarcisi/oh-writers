/**
 * Modal shown when the user tries to assign a scene number that's already
 * used by another scene (spec 05i block 3).
 *
 * Three choices:
 *  - "lock"            — accept the duplicate, other scenes keep their numbers,
 *                        this one becomes proposed + locked even if out of order
 *  - "resequence-from" — renumber the edited scene and everyone after it,
 *                        respecting existing locked flags
 *  - "cancel"          — discard the edit
 *
 * The host (ScreenplayEditor) listens for the `scene-number-conflict` window
 * event dispatched by the heading NodeView and opens this modal with the
 * resolver the NodeView provided. Keeps the NodeView free of React while
 * letting the UX live where it belongs.
 */
import { useEffect } from "react";
import styles from "./SceneNumberConflictModal.module.css";

export type ConflictChoice = "lock" | "resequence-from" | "cancel";

interface Props {
  current: string;
  proposed: string;
  onResolve: (choice: ConflictChoice) => void;
}

export function SceneNumberConflictModal({
  current,
  proposed,
  onResolve,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onResolve("cancel");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Scene number conflict"
      data-testid="scene-number-conflict-modal"
      onClick={() => onResolve("cancel")}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Scene number conflict</h2>
        <p className={styles.body}>
          You&apos;re changing scene <strong>{current || "—"}</strong> to{" "}
          <strong>{proposed}</strong>, but another scene already uses that
          number.
        </p>
        <div className={styles.choices}>
          <button
            type="button"
            className={styles.choiceBtn}
            data-testid="conflict-choice-lock"
            onClick={() => onResolve("lock")}
          >
            <span className={styles.choiceTitle}>Keep numbering locked</span>
            <span className={styles.choiceHint}>
              Other scenes keep their numbers. This one becomes {proposed} and
              stays locked even if out of order.
            </span>
          </button>
          <button
            type="button"
            className={styles.choiceBtn}
            data-testid="conflict-choice-resequence"
            onClick={() => onResolve("resequence-from")}
          >
            <span className={styles.choiceTitle}>
              Resequence from this scene forward
            </span>
            <span className={styles.choiceHint}>
              Every scene from here onward gets renumbered starting from{" "}
              {proposed}.
            </span>
          </button>
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            data-testid="conflict-choice-cancel"
            onClick={() => onResolve("cancel")}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
