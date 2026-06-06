import { useLayoutEffect, useRef, type RefObject } from "react";
import { useButton, useMenu, useMenuItem, useMenuTrigger } from "react-aria";
import { Item, useMenuTriggerState, useTreeState } from "react-stately";
import type { Node, TreeState } from "react-stately";
import styles from "./VersionTrigger.module.css";
import { Icon } from "../../icons/Icon";
import { Popover } from "../Popover/Popover";

export type VersionTriggerVariant = "pill" | "ghost";

export type VersionMenuItem = {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly tone?: "default" | "muted";
};

export type VersionTriggerProps = {
  variant?: VersionTriggerVariant;
  label?: string;
  versionLabel?: string;
  /** Optional leading colour dot (the current version's draft colour). Renders a
   *  small filled circle before the label — the Notion-style stable identifier
   *  (Spec 66 TopBar chip). A hex/CSS colour; omit for no dot. */
  dotColor?: string;
  /** When provided, click opens a popover menu with these items instead of
   *  invoking onClick directly. Useful for the pill variant in the viewbar
   *  where multiple quick actions are useful (open drawer, compare, etc). */
  menuItems?: ReadonlyArray<VersionMenuItem>;
  /** Optional direct click handler. Used when `menuItems` is NOT provided, or
   *  as the default action when both are present (kept for back-compat). */
  onClick?: () => void;
  "data-testid"?: string;
};

// ─── MenuItemInternal ────────────────────────────────────────────────────────

interface MenuItemInternalProps {
  node: Node<VersionMenuItem>;
  itemData: VersionMenuItem;
  state: TreeState<VersionMenuItem>;
  onClose: () => void;
  onAction: (id: string) => void;
}

function MenuItemInternal({
  node,
  itemData,
  state,
  onClose,
  onAction,
}: MenuItemInternalProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { menuItemProps } = useMenuItem(
    {
      key: node.key,
      onAction: () => onAction(String(node.key)),
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
        className={[
          styles.menuItem,
          itemData.tone === "muted" ? styles.menuItemMuted : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {itemData.label}
      </button>
    </li>
  );
}

// ─── MenuList ────────────────────────────────────────────────────────────────

interface MenuListProps {
  items: ReadonlyArray<VersionMenuItem>;
  onClose: () => void;
  /** ARIA props forwarded from useMenuTrigger. */
  ariaMenuProps: object;
}

/**
 * Menu body rendered inside the (already overlay-managed) Popover. Builds the
 * react-stately TreeState that useMenu / useMenuItem require, so arrow-key
 * navigation, type-ahead, Home/End and focus wrapping come from react-aria.
 */
function MenuList({ items, onClose, ariaMenuProps }: MenuListProps) {
  const menuRef = useRef<HTMLUListElement>(null);

  const itemMapRef = useRef<Map<string, VersionMenuItem>>(new Map());
  itemMapRef.current = new Map(items.map((it) => [it.id, it]));

  const treeState = useTreeState<VersionMenuItem>({
    selectionMode: "none",
    children: items.map((item) => (
      <Item key={item.id} textValue={item.label}>
        {item.label}
      </Item>
    )),
    items,
  });

  const { menuProps } = useMenu<VersionMenuItem>(
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

  const handleAction = (id: string) => {
    itemMapRef.current.get(id)?.onSelect();
    onClose();
  };

  return (
    <ul {...menuProps} ref={menuRef} className={styles.menuList}>
      {[...treeState.collection].map((node) => (
        <MenuItemInternal
          key={node.key}
          node={node}
          itemData={itemMapRef.current.get(String(node.key))!}
          state={treeState}
          onClose={onClose}
          onAction={handleAction}
        />
      ))}
    </ul>
  );
}

// ─── VersionTrigger ────────────────────────────────────────────────────────────

export function VersionTrigger({
  variant = "ghost",
  label = "Versioni",
  versionLabel,
  dotColor,
  menuItems,
  onClick,
  "data-testid": testId,
}: VersionTriggerProps) {
  const hasMenu = !!menuItems && menuItems.length > 0;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayLabel =
    variant === "pill" && versionLabel ? versionLabel : label;

  const triggerState = useMenuTriggerState({});
  const { menuTriggerProps, menuProps } = useMenuTrigger<VersionMenuItem>(
    { type: "menu" },
    triggerState,
    triggerRef,
  );

  // In menu mode the trigger toggles the react-stately menu state; otherwise it
  // is a plain action button that calls onClick. Both go through useButton so
  // press handling and ARIA wiring stay consistent with the rest of the DS.
  const { buttonProps } = useButton(
    hasMenu
      ? menuTriggerProps
      : { onPress: () => onClick?.(), "aria-haspopup": "dialog" as const },
    triggerRef,
  );

  return (
    <div className={styles.wrap}>
      <button
        {...buttonProps}
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        data-variant={variant}
        data-testid={testId}
        aria-haspopup={hasMenu ? "menu" : "dialog"}
        aria-expanded={hasMenu ? triggerState.isOpen : undefined}
      >
        {dotColor !== undefined && (
          <span
            className={styles.dot}
            style={{ background: dotColor }}
            aria-hidden={true}
          />
        )}
        <span className={styles.label}>{displayLabel}</span>
        {variant === "pill" ? (
          <Icon name="chevron-down" className={styles.chevron} />
        ) : null}
      </button>

      {hasMenu ? (
        <Popover
          isOpen={triggerState.isOpen}
          onClose={() => triggerState.close()}
          triggerRef={triggerRef}
          placement="bottom-end"
          width={220}
          className={styles.menu}
        >
          <MenuList
            items={menuItems}
            onClose={() => triggerState.close()}
            ariaMenuProps={menuProps}
          />
        </Popover>
      ) : null}
    </div>
  );
}
