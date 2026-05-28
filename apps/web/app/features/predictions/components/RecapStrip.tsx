import { useRef, type CSSProperties } from "react";
import { useButton } from "react-aria";
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";
import styles from "./RecapStrip.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RecapStripCategoryItem {
  readonly category: BreakdownCategory;
  /** Optional display override; defaults to CATEGORY_META[category].labelIt. */
  readonly label?: string;
  /** Count rendered alongside the label (e.g. "Cast 6"). */
  readonly count: number;
}

export interface RecapStripProps {
  /** Scene the recap refers to. Used for the eyebrow label. */
  readonly sceneId: string;
  readonly sceneNumber: number;
  /** Header label rendered after "Sc. N" (e.g. "INT. RADICE"). */
  readonly sceneLabel?: string;
  /** Total day cost, in euros. Formatted in Italian locale. */
  readonly cost: number;
  /** Unit suffix shown next to the cost (default: "/ giornata"). */
  readonly costUnit?: string;
  /** Categories with counts to render as inline chips. */
  readonly categories: ReadonlyArray<RecapStripCategoryItem>;
  /** Click handler for the "Aggiungi al budget" CTA. */
  readonly onAddToBudget?: () => void;
  /** True while a budget mutation is in flight; disables the CTA. */
  readonly isAddPending?: boolean;
  /** Extra className on the wrapper element. */
  readonly className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatEur = (n: number): string =>
  `€ ${Math.round(n).toLocaleString("it-IT")}`;

// ─── Sub-components ────────────────────────────────────────────────────────────

function AddToBudgetButton({
  onPress,
  isPending,
}: {
  onPress: () => void;
  isPending: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      isDisabled: isPending,
    },
    ref,
  );
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={styles.cta}
      data-testid="recap-strip-add-to-budget"
    >
      {isPending ? "Aggiungo…" : "Aggiungi al budget"}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

/**
 * Horizontal recap strip rendered above the Breakdown editor. Mirrors the
 * "Sc. N · €cost · category chips · CTA" row from the mockup. Drop-in for the
 * legacy `CATEGORIE / CESARE` right panel — deep cost analysis lives in the
 * Cesare sub-window instead.
 *
 * The strip is scene-aware: the eyebrow shows the active scene number/label,
 * the chips count category occurrences for that scene, and the CTA forwards
 * the action to the parent which decides whether to call the budget mutation
 * or escalate to Cesare for tougher analyses.
 */
export function RecapStrip({
  sceneId,
  sceneNumber,
  sceneLabel,
  cost,
  costUnit = "/ giornata",
  categories,
  onAddToBudget,
  isAddPending = false,
  className,
}: RecapStripProps) {
  const eyebrow = sceneLabel
    ? `Sc. ${sceneNumber} ${sceneLabel}`
    : `Sc. ${sceneNumber}`;

  const classes = [styles.strip, className ?? ""].filter(Boolean).join(" ");

  return (
    <section
      className={classes}
      data-testid="recap-strip"
      data-scene-id={sceneId}
      aria-label={`Recap scena ${sceneNumber}`}
    >
      <div className={styles.costBlock}>
        <span className={styles.label}>{eyebrow}</span>
        <span className={styles.cost}>
          {formatEur(cost)}
          <small>{costUnit}</small>
        </span>
      </div>

      {categories.length > 0 && (
        <ul className={styles.cats} aria-label="Categorie">
          {categories.map((item) => {
            const meta = CATEGORY_META[item.category];
            const label = item.label ?? meta.labelIt;
            const dotStyle = {
              "--cat-color": `var(${meta.colorToken})`,
            } as CSSProperties;
            return (
              <li
                key={item.category}
                className={styles.cat}
                data-cat={item.category}
              >
                <span
                  className={styles.dot}
                  aria-hidden="true"
                  style={dotStyle}
                />
                <span className={styles.catLabel}>
                  {label} <span data-num>{item.count}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <span className={styles.spacer} />

      {onAddToBudget !== undefined && (
        <AddToBudgetButton onPress={onAddToBudget} isPending={isAddPending} />
      )}
    </section>
  );
}
