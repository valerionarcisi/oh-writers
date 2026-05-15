import { useRef, useState, type ReactNode } from "react";
import { Popover } from "../Popover/Popover";
import { Icon } from "../../icons/Icon";
import styles from "./ViewSwitcher.module.css";

// Note: Icon is imported only for the trigger chevron — the active-row marker
// uses a CSS-only dot to avoid depending on a `check` icon name.

export type ViewSwitcherOption<Id extends string = string> = {
  readonly id: Id;
  readonly label: string;
  readonly hint?: string;
};

export type ViewSwitcherProps<Id extends string = string> = {
  readonly options: ReadonlyArray<ViewSwitcherOption<Id>>;
  readonly activeId: Id;
  readonly onSelect: (id: Id) => void;
  /** Prefix shown before the active label, e.g. "Vista". Defaults to "Vista". */
  readonly label?: string;
  readonly ariaLabel?: string;
  /** Optional content rendered above the option list — e.g. a small caption. */
  readonly headerSlot?: ReactNode;
};

/**
 * Compact view-switcher used in the Viewbar where exactly one option can be
 * active and the choice maps to a top-level page view. Single button + popover
 * — no horizontal real estate spent on tabs. For multi-select or modal toggles
 * use ToggleChip instead.
 */
export function ViewSwitcher<Id extends string = string>({
  options,
  activeId,
  onSelect,
  label = "Vista",
  ariaLabel,
  headerSlot,
}: ViewSwitcherProps<Id>) {
  const [isOpen, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const active = options.find((o) => o.id === activeId) ?? options[0];
  if (!active) return null;

  const handleSelect = (id: Id) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel ?? `${label}: ${active.label}`}
      >
        <span className={styles.prefix}>{label}</span>
        <span className={styles.value}>{active.label}</span>
        <Icon name="chevron-down" size={14} className={styles.chev} />
      </button>

      <Popover
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        placement="bottom-start"
        width={220}
        className={styles.popover}
      >
        {headerSlot ? <div className={styles.header}>{headerSlot}</div> : null}
        <div role="menu" className={styles.list}>
          {options.map((o) => {
            const isActive = o.id === active.id;
            return (
              <button
                key={o.id}
                type="button"
                role="menuitem"
                className={[
                  styles.item,
                  isActive ? styles.itemActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleSelect(o.id)}
                aria-current={isActive ? "true" : undefined}
              >
                <span className={styles.itemLabel}>{o.label}</span>
                {o.hint ? (
                  <span className={styles.itemHint}>{o.hint}</span>
                ) : null}
                {isActive ? (
                  <span className={styles.itemCheck} aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </Popover>
    </div>
  );
}
