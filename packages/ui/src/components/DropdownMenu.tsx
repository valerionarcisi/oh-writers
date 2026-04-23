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
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 0;
    const left = align === "end" ? rect.right - menuWidth : rect.left;
    setCoords({ top: rect.bottom + 4, left });
  }, [open, align]);

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
      {open && typeof document !== "undefined" && coords
        ? createPortal(
            <ul
              ref={menuRef}
              id={menuId}
              role="menu"
              className={styles.menu}
              style={{ top: coords.top, left: coords.left }}
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
