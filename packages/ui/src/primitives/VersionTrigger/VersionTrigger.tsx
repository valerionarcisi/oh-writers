import { useRef, useState } from "react";
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
  /** When provided, click opens a popover menu with these items instead of
   *  invoking onClick directly. Useful for the pill variant in the viewbar
   *  where multiple quick actions are useful (open drawer, compare, etc). */
  menuItems?: ReadonlyArray<VersionMenuItem>;
  /** Optional direct click handler. Used when `menuItems` is NOT provided, or
   *  as the default action when both are present (kept for back-compat). */
  onClick?: () => void;
};

export function VersionTrigger({
  variant = "ghost",
  label = "Versioni",
  versionLabel,
  menuItems,
  onClick,
}: VersionTriggerProps) {
  const [isOpen, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayLabel =
    variant === "pill" && versionLabel ? versionLabel : label;

  const handleTriggerClick = () => {
    if (menuItems && menuItems.length > 0) {
      setOpen((v) => !v);
    } else if (onClick) {
      onClick();
    }
  };

  const handleSelect = (item: VersionMenuItem) => {
    item.onSelect();
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        data-variant={variant}
        onClick={handleTriggerClick}
        aria-haspopup={menuItems ? "menu" : "dialog"}
        aria-expanded={menuItems ? isOpen : undefined}
      >
        <span className={styles.label}>{displayLabel}</span>
        {variant === "pill" ? (
          <Icon name="chevron-down" className={styles.chevron} />
        ) : null}
      </button>

      {menuItems && menuItems.length > 0 ? (
        <Popover
          isOpen={isOpen}
          onClose={() => setOpen(false)}
          placement="bottom-end"
          width={220}
          className={styles.menu}
        >
          <div role="menu" className={styles.menuList}>
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${item.tone === "muted" ? styles.menuItemMuted : ""}`}
                onClick={() => handleSelect(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
