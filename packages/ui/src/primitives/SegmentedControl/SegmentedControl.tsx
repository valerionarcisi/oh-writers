import { createContext, useContext, useRef } from "react";
import { useRadio, useRadioGroup } from "react-aria";
import { useRadioGroupState } from "react-stately";
import type { RadioGroupState } from "react-stately";
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

const RadioGroupContext = createContext<RadioGroupState | null>(null);

/**
 * iOS-style segmented control: a single horizontal piece with the active
 * option lifted as a small white "card". Used for short mutually-exclusive
 * view switches (Per scena / Per progetto / Matrice, etc).
 *
 * Implemented as a single-select radio group via react-aria so arrow-key
 * selection and roving focus come for free. The exposed ARIA role is `radio`
 * (group `radiogroup`); the active option carries `aria-checked`.
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
  const state = useRadioGroupState({
    value: activeId,
    onChange: (value) => onSelect(value as Id),
  });
  const { radioGroupProps } = useRadioGroup(
    { "aria-label": ariaLabel, orientation: "horizontal" },
    state,
  );

  return (
    <div className={styles.group} {...radioGroupProps}>
      <RadioGroupContext.Provider value={state}>
        {options.map((o) => (
          <SegmentedOption key={o.id} id={o.id} label={o.label} />
        ))}
      </RadioGroupContext.Provider>
    </div>
  );
}

type SegmentedOptionProps = {
  readonly id: string;
  readonly label: string;
};

function SegmentedOption({ id, label }: SegmentedOptionProps) {
  const state = useContext(RadioGroupContext);
  if (!state) {
    throw new Error("SegmentedOption must be rendered inside SegmentedControl");
  }
  const ref = useRef<HTMLInputElement>(null);
  const { inputProps } = useRadio(
    { value: id, "aria-label": label },
    state,
    ref,
  );
  const isActive = state.selectedValue === id;

  return (
    <label
      className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
    >
      <input
        {...inputProps}
        ref={ref}
        className={styles.input}
        data-testid={`segmented-${id}`}
      />
      {label}
    </label>
  );
}
