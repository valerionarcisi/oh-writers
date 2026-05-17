import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMenu, useMenuItem, FocusScope, useOverlay } from "react-aria";
import { useTreeState, Item } from "react-stately";
import type { TreeState, Node } from "react-stately";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  open: boolean;
  anchor: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  "data-testid"?: string;
}

// ─── ContextMenuItemInternal ─────────────────────────────────────────────────

interface ContextMenuItemInternalProps {
  item: Node<ContextMenuItem>;
  state: TreeState<ContextMenuItem>;
  onClose: () => void;
  onAction: (label: string) => void;
}

function ContextMenuItemInternal({
  item,
  state,
  onClose,
  onAction,
}: ContextMenuItemInternalProps) {
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

  const raw = item.value as ContextMenuItem;

  return (
    <li role="none">
      <button
        {...menuItemProps}
        ref={ref}
        type="button"
        className={styles.item}
        disabled={isDisabled}
      >
        {raw.icon && (
          <span className={styles.icon} aria-hidden>
            {raw.icon}
          </span>
        )}
        <span>{raw.label}</span>
      </button>
    </li>
  );
}

// ─── ContextMenuList ──────────────────────────────────────────────────────────

interface ContextMenuListProps {
  items: ContextMenuItem[];
  anchor: { x: number; y: number };
  onClose: () => void;
  "data-testid"?: string;
}

/**
 * Portalled menu list for ContextMenu. Viewport-clamped positioning is
 * preserved from the original implementation. The list portion is now
 * driven by react-aria useMenu + useMenuItem for full keyboard nav,
 * type-ahead, arrow-key focus, and proper ARIA roles.
 */
function ContextMenuList({
  items,
  anchor,
  onClose,
  "data-testid": testId,
}: ContextMenuListProps) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: anchor.y,
    left: anchor.x,
  });

  // Clamp the menu inside the viewport on first render — flip up / shift left
  // when the natural anchor would push the menu off-screen. Run as a layout
  // effect so the corrected coordinates land before the browser paints.
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let top = anchor.y;
    let left = anchor.x;
    if (top + rect.height > vh - margin)
      top = Math.max(margin, vh - rect.height - margin);
    if (left + rect.width > vw - margin)
      left = Math.max(margin, vw - rect.width - margin);
    setPos({ top, left });
  }, [anchor.x, anchor.y]);

  // Build a lookup so we can fire the original onClick by label-key.
  const itemMap = new Map(items.map((it) => [it.label, it]));

  // useOverlay handles Escape dismiss and click-outside dismiss.
  const { overlayProps } = useOverlay(
    { isOpen: true, onClose, isDismissable: true, isKeyboardDismissDisabled: false },
    menuRef as RefObject<Element>,
  );

  const treeState = useTreeState<ContextMenuItem>({
    selectionMode: "none",
    children: items.map((item) => (
      <Item key={item.label} textValue={item.label}>
        {item.label}
      </Item>
    )),
    disabledKeys: items.filter((it) => it.disabled).map((it) => it.label),
    items,
  });

  const { menuProps } = useMenu<ContextMenuItem>(
    {
      onClose,
      autoFocus: true,
      shouldFocusWrap: true,
    },
    treeState,
    menuRef as RefObject<HTMLElement>,
  );

  const handleAction = (label: string) => {
    itemMap.get(label)?.onClick();
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <FocusScope restoreFocus>
      <ul
        {...overlayProps}
        {...menuProps}
        ref={menuRef}
        className={styles.menu}
        style={{ top: pos.top, left: pos.left }}
        data-testid={testId}
      >
        {[...treeState.collection].map((node) => (
          <ContextMenuItemInternal
            key={node.key}
            item={node}
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

// ─── ContextMenu ─────────────────────────────────────────────────────────────

/**
 * Right-click context menu. The trigger mechanism (contextmenu event,
 * anchor position) is managed by the caller — only the menu list uses
 * react-aria for keyboard nav, type-ahead, and ARIA semantics.
 */
export function ContextMenu({
  open,
  anchor,
  items,
  onClose,
  ...rest
}: ContextMenuProps) {
  if (!open || typeof document === "undefined") return null;

  return (
    <ContextMenuList
      items={items}
      anchor={anchor}
      onClose={onClose}
      data-testid={rest["data-testid"]}
    />
  );
}
