import styles from "./SegmentedControl.module.css";

export type SegmentedControlOption<Id extends string = string> = {
  readonly id: Id;
  readonly label: string;
};

export type SegmentedControlProps<Id extends string = string> = {
  readonly options: ReadonlyArray<SegmentedControlOption<Id>>;
  readonly activeId: Id;
  readonly onSelect: (id: Id) => void;
  readonly ariaLabel?: string;
};

/**
 * iOS-style segmented control: a single horizontal piece with the active
 * option lifted as a small white "card". Used for short mutually-exclusive
 * view switches (Per scena / Per progetto / Matrice, etc).
 *
 * For longer lists or dropdown-style menus, use ViewSwitcher. For top-level
 * filter tabs with multi-state (e.g. Dashboard filters), use Tabs.
 */
export function SegmentedControl<Id extends string = string>({
  options,
  activeId,
  onSelect,
  ariaLabel,
}: SegmentedControlProps<Id>) {
  return (
    <div
      className={styles.group}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const isActive = o.id === activeId;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
            onClick={() => onSelect(o.id)}
            data-testid={`segmented-${o.id}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
