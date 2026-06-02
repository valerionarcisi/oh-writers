import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  useMenuTrigger,
  useMenu,
  useMenuItem,
  useButton,
  FocusScope,
  useInteractOutside,
} from "react-aria";
import { useMenuTriggerState, useTreeState, Item } from "react-stately";
import type { TreeState, Node } from "react-stately";
import styles from "./DropdownMenu.module.css";

/** Minimum gap kept between the menu and the viewport edge. */
const VIEWPORT_MARGIN = 8;
/** Vertical gap between the trigger and the menu. */
const MENU_OFFSET = 4;

export interface DropdownMenuItem {
  label: string;
  description?: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Stable E2E hook for the rendered menu-item button (locale-independent). */
  testId?: string;
}

export type DropdownMenuAlign = "start" | "end";

export interface DropdownMenuProps {
  /** Any element/components — wrapped in a `display:contents` span so we
   *  can anchor without requiring the trigger to forward refs. */
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: DropdownMenuAlign;
  "data-testid"?: string;
  /** Extra className applied to the wrapper <button> — use to override width/layout. */
  triggerClassName?: string;
  /** Accessible label for the trigger button. Required when the trigger is
   *  icon-only (e.g. the "…" more button) so screen readers announce it. */
  triggerLabel?: string;
  /** Native tooltip text for the trigger button. */
  triggerTitle?: string;
  /** Disables the trigger button (greys it out, blocks opening the menu). */
  triggerDisabled?: boolean;
  /** Stable E2E hook for the trigger button (locale-independent). The
   *  `data-testid` prop, by contrast, lands on the portalled menu list. */
  triggerTestId?: string;
}

// ─── MenuItemInternal ────────────────────────────────────────────────────────

interface MenuItemInternalProps {
  item: Node<DropdownMenuItem>;
  /** The resolved DropdownMenuItem data for this node (node.value is null with static JSX children). */
  itemData: DropdownMenuItem;
  state: TreeState<DropdownMenuItem>;
  onClose: () => void;
  /** Called with the item label (its key) when selected. */
  onAction: (label: string) => void;
}

function MenuItemInternal({
  item,
  itemData,
  state,
  onClose,
  onAction,
}: MenuItemInternalProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { menuItemProps, isDisabled } = useMenuItem(
    {
      key: item.key,
      onAction: () => onAction(String(item.key)),
      onClose,
    },
    state,
    ref,
  );

  const raw = itemData;

  return (
    <li role="none">
      <button
        {...menuItemProps}
        ref={ref}
        type="button"
        className={styles.item}
        disabled={isDisabled}
        data-testid={raw.testId}
      >
        {raw.icon && (
          <span className={styles.icon} aria-hidden>
            {raw.icon}
          </span>
        )}
        <span className={styles.body}>
          <span className={styles.label}>{raw.label}</span>
          {raw.description && (
            <span className={styles.description}>{raw.description}</span>
          )}
        </span>
      </button>
    </li>
  );
}

// ─── MenuList ────────────────────────────────────────────────────────────────

interface MenuListProps {
  items: DropdownMenuItem[];
  align: DropdownMenuAlign;
  menuId: string;
  "data-testid"?: string;
  onClose: () => void;
  /** Props forwarded from useMenuTrigger. */
  ariaMenuProps: object;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Portalled menu list. Manages its own TreeState (needed by useMenu /
 * useMenuItem) and viewport-aware positioning (flip up / clamp x).
 */
function MenuList({
  items,
  align,
  menuId,
  "data-testid": testId,
  onClose,
  ariaMenuProps,
  triggerRef,
}: MenuListProps) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  // Build a lookup so we can fire the original onClick by label-key.
  const itemMapRef = useRef<Map<string, DropdownMenuItem>>(new Map());
  itemMapRef.current = new Map(items.map((it) => [it.label, it]));

  /**
   * Place the menu under the trigger, clamping to the viewport so it never
   * overflows. Flips to above the trigger if there isn't enough room below.
   */
  const reposition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();

    const desiredLeft =
      align === "end" ? triggerRect.right - menuRect.width : triggerRect.left;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        desiredLeft,
        window.innerWidth - menuRect.width - VIEWPORT_MARGIN,
      ),
    );

    let top = triggerRect.bottom + MENU_OFFSET;
    const overflowsBottom =
      top + menuRect.height > window.innerHeight - VIEWPORT_MARGIN;
    if (overflowsBottom) {
      const flipped = triggerRect.top - menuRect.height - MENU_OFFSET;
      top = flipped >= VIEWPORT_MARGIN ? flipped : VIEWPORT_MARGIN;
    }

    setCoords({ top, left });
  }, [align, triggerRef]);

  /**
   * The menu is rendered every render while open (initially off-screen so
   * it can be measured), then reposition runs in a layout effect and on
   * window resize. Without the off-screen first paint we'd anchor against a
   * 0-width menu and slide off the right edge with align="end".
   */
  useLayoutEffect(() => {
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [reposition]);

  // react-stately TreeState drives useMenu + useMenuItem.
  const treeState = useTreeState<DropdownMenuItem>({
    selectionMode: "none",
    children: items.map((item) => (
      <Item key={item.label} textValue={item.label}>
        {item.label}
      </Item>
    )),
    disabledKeys: items.filter((it) => it.disabled).map((it) => it.label),
    items,
  });

  const { menuProps } = useMenu<DropdownMenuItem>(
    {
      ...ariaMenuProps,
      onClose,
      autoFocus: true,
      shouldFocusWrap: true,
    },
    treeState,
    menuRef as RefObject<HTMLElement>,
  );

  // Close when the user clicks or taps outside the menu (and outside the
  // trigger, which is handled separately by useMenuTrigger).
  useInteractOutside({
    ref: menuRef,
    onInteractOutside: onClose,
  });

  const handleAction = useCallback(
    (label: string) => {
      itemMapRef.current.get(label)?.onClick();
      onClose();
    },
    [onClose],
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <FocusScope restoreFocus>
      <ul
        {...menuProps}
        ref={menuRef}
        id={menuId}
        className={styles.menu}
        style={
          coords
            ? { top: coords.top, left: coords.left }
            : { top: -9999, left: -9999, visibility: "hidden" }
        }
        data-testid={testId}
      >
        {[...treeState.collection].map((node) => (
          <MenuItemInternal
            key={node.key}
            item={node}
            itemData={itemMapRef.current.get(String(node.key))!}
            state={treeState}
            onClose={onClose}
            onAction={handleAction}
          />
        ))}
      </ul>
    </FocusScope>,
    document.body,
  );
}

// ─── DropdownMenu ────────────────────────────────────────────────────────────

/**
 * Triggered dropdown menu. Anchors to its trigger's bounding box and
 * portals into <body> so it escapes ancestor `overflow:hidden` clipping.
 *
 * Arrow-key navigation, type-ahead, Home/End, and Escape are handled
 * automatically by react-aria (useMenuTrigger + useMenu + useMenuItem).
 */
export function DropdownMenu({
  trigger,
  items,
  align = "start",
  triggerClassName,
  triggerLabel,
  triggerTitle,
  triggerDisabled = false,
  triggerTestId,
  ...rest
}: DropdownMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const triggerState = useMenuTriggerState({});

  const { menuTriggerProps, menuProps } = useMenuTrigger<DropdownMenuItem>(
    { type: "menu" },
    triggerState,
    triggerRef,
  );

  // useButton handles cross-browser press, aria-expanded, aria-haspopup.
  const { buttonProps } = useButton(
    {
      ...menuTriggerProps,
      "aria-controls": menuId,
      isDisabled: triggerDisabled,
    },
    triggerRef,
  );

  return (
    <>
      <button
        {...buttonProps}
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        title={triggerTitle}
        data-testid={triggerTestId}
        className={[styles.triggerWrap, triggerClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {trigger}
      </button>
      {triggerState.isOpen ? (
        <MenuList
          items={items}
          align={align}
          menuId={menuId}
          data-testid={rest["data-testid"]}
          onClose={() => triggerState.close()}
          ariaMenuProps={menuProps}
          triggerRef={triggerRef}
        />
      ) : null}
    </>
  );
}
