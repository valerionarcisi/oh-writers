// packages/ui/src/composites/ChangeTrace/ChangeTrace.tsx
//
// Notion-style "step block + change trace" primitive shipped by Spec 44
// (WP-CHAT-FIX). Rendered inside an assistant message — or anywhere a batch
// write operation completes — to summarise what was changed and expose a
// `Mostra modifiche` / `Nascondi modifiche` affordance.
//
// Spec 47e removed the inline `Annulla` action: the edit is always applied and
// "Mostra / Nascondi" is a transient flash (green additions / red previous
// text), not a revert. True rollback lives in the Versions SplitDrawer.
//
// The component is intentionally NOT Cesare-specific: any feature in OHW that
// finishes a multi-step write (bulk Fountain import, version restore, settings
// batch apply…) can wrap its "operation done" feedback in `<ChangeTrace/>`
// for consistency with the assistant chat surface.
//
// Visual structure (Notion AI / ChatGPT Canvas reference):
//
//   N steps ▾
//      · Thought ▾
//      · Updated page · [Page Title with icon]
//   Done.
//   ┌──────────────────────────────────────────────────────────┐
//   │ Updated Soggetto · 3 scene rinominate                    │
//   │ [Mostra modifiche]                                       │
//   └──────────────────────────────────────────────────────────┘
//
// Public API exposes a controlled `isShowingChanges` flag so the consumer
// can drive both the diff overlay AND the entity highlight in sync with the
// button's label (`Mostra modifiche` ↔ `Nascondi modifiche`).
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useButton } from "react-aria";
import styles from "./ChangeTrace.module.css";

// ─── Public types ───────────────────────────────────────────────────────────

/**
 * The domains the ChangeTrace can summarise. Each maps to an icon glyph in
 * the steps list. Adding a new kind requires extending `KIND_GLYPH` below.
 */
export type ChangeUpdateKind =
  | "page"
  | "doc"
  | "scene"
  | "breakdown"
  | "budget"
  | "schedule"
  | "location";

export interface ChangeUpdate {
  /** Stable id used as React key. */
  readonly id?: string;
  /** Which domain the update touched — drives the default icon glyph. */
  readonly kind: ChangeUpdateKind;
  /** Human-readable label, e.g. `"Soggetto"`, `"Sc.2 - INT. UFFICIO"`. */
  readonly label: string;
  /** Optional custom icon. When omitted the kind's glyph is used. */
  readonly icon?: ReactNode;
}

export interface ChangeTraceProps {
  /** Bold summary title — e.g. `"Aggiornata Sceneggiatura · 3 scene rinominate"`. */
  readonly title: string;
  /** Number of total steps the assistant ran. Drives the `N passaggi` label. */
  readonly stepCount: number;
  /** Optional reasoning summary entries (`"Thought"`, `"Read soggetto"`…). */
  readonly thoughts?: ReadonlyArray<string>;
  /** Affected entities — surfaced under the steps + diff target list. */
  readonly updates: ReadonlyArray<ChangeUpdate>;
  /** Fires when the user clicks `Mostra modifiche`. The consumer is expected
   *  to open whatever surface shows the diff (SplitDrawer, overlay, …). */
  readonly onShowChanges: () => void;
  /** Fires when the user clicks `Nascondi modifiche`. Optional — defaults to
   *  the same callback as `onShowChanges` (toggle). */
  readonly onHideChanges?: () => void;
  /** Controlled flag mirroring whether the consumer's diff surface is open.
   *  Drives the button label (`Mostra` ↔ `Nascondi`). When omitted the
   *  component holds its own state. */
  readonly isShowingChanges?: boolean;
  /** Defaults to false: the steps list opens collapsed; `true` opens expanded. */
  readonly defaultStepsOpen?: boolean;
  /** Optional className passed to the outer `<article/>`. */
  readonly className?: string;
  /** E2E hook. */
  readonly testId?: string;
}

const KIND_GLYPH: Record<ChangeUpdateKind, string> = {
  page: "▦",
  doc: "▤",
  scene: "▶",
  breakdown: "✦",
  budget: "€",
  schedule: "▣",
  location: "◉",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ChangeTrace({
  title,
  stepCount,
  thoughts,
  updates,
  onShowChanges,
  onHideChanges,
  isShowingChanges,
  defaultStepsOpen = false,
  className,
  testId,
}: ChangeTraceProps) {
  const stepsId = useId();
  const [isStepsOpen, setStepsOpen] = useState(defaultStepsOpen);
  const stepsBtnRef = useRef<HTMLButtonElement>(null);
  const showBtnRef = useRef<HTMLButtonElement>(null);

  // Controlled / uncontrolled fallback so consumers can either drive the
  // label themselves or let the component own the toggle state.
  const [internalShowing, setInternalShowing] = useState(false);
  const showing = isShowingChanges ?? internalShowing;

  const handleStepsToggle = useCallback(() => {
    setStepsOpen((prev) => !prev);
  }, []);

  const handleShowChangesPress = useCallback(() => {
    if (showing) {
      setInternalShowing(false);
      (onHideChanges ?? onShowChanges)();
      return;
    }
    setInternalShowing(true);
    onShowChanges();
  }, [showing, onShowChanges, onHideChanges]);

  const { buttonProps: stepsBtnProps } = useButton(
    {
      onPress: handleStepsToggle,
      "aria-expanded": isStepsOpen,
      "aria-controls": stepsId,
      elementType: "button",
    },
    stepsBtnRef,
  );

  const { buttonProps: showBtnProps } = useButton(
    {
      onPress: handleShowChangesPress,
      elementType: "button",
      "aria-pressed": showing,
    },
    showBtnRef,
  );

  const stepLabel = stepCount === 1 ? "1 passaggio" : `${stepCount} passaggi`;
  const showLabel = showing ? "Nascondi modifiche" : "Mostra modifiche";
  const updatesLabel =
    updates.length === 1 ? "1 modifica" : `${updates.length} modifiche`;

  const classes = [styles.root, className ?? ""].filter(Boolean).join(" ");

  return (
    <article
      className={classes}
      data-testid={testId}
      data-state={showing ? "showing" : "idle"}
      aria-label={title}
    >
      {/* Steps section — collapsible "N passaggi ▾" header */}
      <div className={styles.steps}>
        <button
          {...stepsBtnProps}
          ref={stepsBtnRef}
          type="button"
          className={styles.stepsHeader}
        >
          <span className={styles.stepsCount}>{stepLabel}</span>
          <span aria-hidden="true" className={styles.chev}>
            ▾
          </span>
        </button>
        {isStepsOpen && (
          <div id={stepsId} className={styles.stepsBody}>
            {thoughts && thoughts.length > 0 && (
              <ul className={styles.thoughts}>
                {thoughts.map((t, i) => (
                  <li key={`t-${i}`} className={styles.thoughtItem}>
                    <span aria-hidden="true" className={styles.thoughtDot}>
                      ·
                    </span>
                    <span className={styles.thoughtLabel}>{t}</span>
                  </li>
                ))}
              </ul>
            )}
            {updates.length > 0 && (
              <ul className={styles.updatesList} aria-label="Entità aggiornate">
                {updates.map((u, i) => (
                  <li
                    key={u.id ?? `u-${i}`}
                    className={styles.updateRow}
                    data-kind={u.kind}
                  >
                    <span aria-hidden="true" className={styles.updateDot}>
                      ·
                    </span>
                    <span aria-hidden="true" className={styles.updateGlyph}>
                      {u.icon ?? KIND_GLYPH[u.kind]}
                    </span>
                    <span className={styles.updateLabel}>{u.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Summary card — title + reactions */}
      <div className={styles.summary}>
        <div className={styles.summaryHeader}>
          <span className={styles.summaryTitle}>{title}</span>
          <span aria-hidden="true" className={styles.summaryMeta}>
            {updatesLabel}
          </span>
        </div>
        <div className={styles.summaryActions}>
          <button
            {...showBtnProps}
            ref={showBtnRef}
            type="button"
            className={styles.actionPrimary}
            data-state={showing ? "active" : "idle"}
            data-testid="cesare-show-changes-btn"
          >
            {showLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
