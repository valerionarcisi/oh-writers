import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
}

export type DropdownMenuAlign = "start" | "end";

export interface DropdownMenuProps {
  /** Any element/components — wrapped in a `display:contents` span so we
   *  can anchor without requiring the trigger to forward refs. */
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: DropdownMenuAlign;
  "data-testid"?: string;
}

/**
 * Triggered dropdown menu. Anchors to its trigger's bounding box and
 * portals into <body> so it escapes ancestor `overflow:hidden` clipping.
 * Outside-click + ESC close, like ContextMenu.
 */
export function DropdownMenu({
  trigger,
  items,
  align = "start",
  ...rest
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  /**
   * Place the menu under the trigger, clamping to the viewport so it never
   * overflows. Flips to above the trigger if there isn't enough room below.
   * Reads from `triggerRef` and `menuRef`; returns early if either is unset.
   */
  const reposition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();

    const desiredLeft =
      align === "end" ? trigger.right - menu.width : trigger.left;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(desiredLeft, window.innerWidth - menu.width - VIEWPORT_MARGIN),
    );

    let top = trigger.bottom + MENU_OFFSET;
    const overflowsBottom =
      top + menu.height > window.innerHeight - VIEWPORT_MARGIN;
    if (overflowsBottom) {
      const flipped = trigger.top - menu.height - MENU_OFFSET;
      top = flipped >= VIEWPORT_MARGIN ? flipped : VIEWPORT_MARGIN;
    }

    setCoords({ top, left });
  }, [align]);

  /**
   * The menu is rendered every render while open (initially off-screen so
   * it can be measured), then `reposition` runs in a layout effect and on
   * window resize. Without the off-screen first paint we'd anchor against a
   * 0-width menu and slide off the right edge with `align="end"`.
   */
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    reposition();
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, close]);

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.triggerWrap}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClickCapture={() => setOpen((prev) => !prev)}
      >
        {trigger}
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              id={menuId}
              role="menu"
              className={styles.menu}
              style={
                coords
                  ? { top: coords.top, left: coords.left }
                  : { top: -9999, left: -9999, visibility: "hidden" }
              }
              data-testid={rest["data-testid"]}
            >
              {items.map((item) => (
                <li key={item.label} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.item}
                    disabled={item.disabled}
                    onClick={() => {
                      item.onClick();
                      close();
                    }}
                  >
                    {item.icon && (
                      <span className={styles.icon} aria-hidden>
                        {item.icon}
                      </span>
                    )}
                    <span className={styles.body}>
                      <span className={styles.label}>{item.label}</span>
                      {item.description && (
                        <span className={styles.description}>
                          {item.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
