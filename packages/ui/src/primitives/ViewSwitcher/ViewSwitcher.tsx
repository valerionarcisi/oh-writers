import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useButton, useMenu, useMenuItem, useMenuTrigger } from "react-aria";
import { Item, useMenuTriggerState, useTreeState } from "react-stately";
import type { Node, TreeState } from "react-stately";
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

// ─── MenuItemInternal ────────────────────────────────────────────────────────

interface MenuItemInternalProps<Id extends string> {
  node: Node<ViewSwitcherOption<Id>>;
  option: ViewSwitcherOption<Id>;
  isActive: boolean;
  state: TreeState<ViewSwitcherOption<Id>>;
  onClose: () => void;
  onAction: (id: Id) => void;
}

function MenuItemInternal<Id extends string>({
  node,
  option,
  isActive,
  state,
  onClose,
  onAction,
}: MenuItemInternalProps<Id>) {
  const ref = useRef<HTMLButtonElement>(null);
  const { menuItemProps } = useMenuItem(
    {
      key: node.key,
      onAction: () => onAction(String(node.key) as Id),
      onClose,
    },
    state,
    ref,
  );

  return (
    <li role="none">
      <button
        {...menuItemProps}
        ref={ref}
        type="button"
        className={[styles.item, isActive ? styles.itemActive : ""]
          .filter(Boolean)
          .join(" ")}
        aria-current={isActive ? "true" : undefined}
      >
        <span className={styles.itemLabel}>{option.label}</span>
        {option.hint ? (
          <span className={styles.itemHint}>{option.hint}</span>
        ) : null}
        {isActive ? (
          <span className={styles.itemCheck} aria-hidden="true" />
        ) : null}
      </button>
    </li>
  );
}

// ─── MenuList ────────────────────────────────────────────────────────────────

interface MenuListProps<Id extends string> {
  options: ReadonlyArray<ViewSwitcherOption<Id>>;
  activeId: Id;
  headerSlot?: ReactNode;
  onClose: () => void;
  onAction: (id: Id) => void;
  /** ARIA props forwarded from useMenuTrigger. */
  ariaMenuProps: object;
}

/**
 * Menu body rendered inside the (already overlay-managed) Popover. The
 * react-stately TreeState drives useMenu / useMenuItem so arrow-key navigation,
 * type-ahead, Home/End and focus wrapping come from react-aria.
 */
function MenuList<Id extends string>({
  options,
  activeId,
  headerSlot,
  onClose,
  onAction,
  ariaMenuProps,
}: MenuListProps<Id>) {
  const menuRef = useRef<HTMLUListElement>(null);

  const optionMapRef = useRef<Map<string, ViewSwitcherOption<Id>>>(new Map());
  optionMapRef.current = new Map(options.map((o) => [o.id, o]));

  // selectionMode "none" keeps each row a plain `role=menuitem` (single mode
  // would emit menuitemradio/aria-checked); the active row is marked with
  // explicit aria-current + the CSS dot, matching the original markup.
  const treeState = useTreeState<ViewSwitcherOption<Id>>({
    selectionMode: "none",
    children: options.map((option) => (
      <Item key={option.id} textValue={option.label}>
        {option.label}
      </Item>
    )),
    items: options,
  });

  const { menuProps } = useMenu<ViewSwitcherOption<Id>>(
    { ...ariaMenuProps, onClose, autoFocus: "first", shouldFocusWrap: true },
    treeState,
    menuRef as RefObject<HTMLElement>,
  );

  // The enclosing Popover's FocusScope autoFocuses the menu container (the
  // <ul>), which beats useMenu's autoFocus. Move focus onto the first item so a
  // freshly opened menu behaves like a standard menu (first ArrowDown advances).
  useLayoutEffect(() => {
    const firstItem =
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  return (
    <>
      {headerSlot ? <div className={styles.header}>{headerSlot}</div> : null}
      <ul {...menuProps} ref={menuRef} className={styles.list}>
        {[...treeState.collection].map((node) => {
          const option = optionMapRef.current.get(String(node.key))!;
          return (
            <MenuItemInternal
              key={node.key}
              node={node}
              option={option}
              isActive={option.id === activeId}
              state={treeState}
              onClose={onClose}
              onAction={onAction}
            />
          );
        })}
      </ul>
    </>
  );
}

// ─── ViewSwitcher ────────────────────────────────────────────────────────────

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const active = options.find((o) => o.id === activeId) ?? options[0];

  const triggerState = useMenuTriggerState({});
  const { menuTriggerProps, menuProps } = useMenuTrigger<
    ViewSwitcherOption<Id>
  >({ type: "menu" }, triggerState, triggerRef);

  const { buttonProps } = useButton(
    {
      ...menuTriggerProps,
      "aria-label": ariaLabel ?? (active ? `${label}: ${active.label}` : label),
    },
    triggerRef,
  );

  if (!active) return null;

  const handleAction = (id: Id) => {
    onSelect(id);
    triggerState.close();
  };

  return (
    <div className={styles.wrap}>
      <button
        {...buttonProps}
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={triggerState.isOpen}
      >
        <span className={styles.prefix}>{label}</span>
        <span className={styles.value}>{active.label}</span>
        <Icon name="chevron-down" size={14} className={styles.chev} />
      </button>

      <Popover
        isOpen={triggerState.isOpen}
        onClose={() => triggerState.close()}
        triggerRef={triggerRef}
        placement="bottom-start"
        width={220}
        className={styles.popover}
      >
        <MenuList
          options={options}
          activeId={activeId}
          headerSlot={headerSlot}
          onClose={() => triggerState.close()}
          onAction={handleAction}
          ariaMenuProps={menuProps}
        />
      </Popover>
    </div>
  );
}
