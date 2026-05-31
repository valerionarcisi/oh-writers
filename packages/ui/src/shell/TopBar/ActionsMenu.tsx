import { DropdownMenu } from "../../components/DropdownMenu";
import type { DropdownMenuItem } from "../../components/DropdownMenu";
import { Icon } from "../../icons/Icon";
import styles from "./ActionsMenu.module.css";

export interface ActionsMenuProps {
  /** Menu entries, populated per-page (Versioni, Esporta, Importa, …). */
  items: DropdownMenuItem[];
  /** Accessible label for the trigger. Defaults to a generic "more" label. */
  label?: string;
  "data-testid"?: string;
}

/**
 * The single "…" (more) actions menu for the TopBar right slot. Pages publish
 * it into the `actions` slot with a per-page item list, replacing the old
 * per-page icon buttons. Reuses `DropdownMenu` for react-aria menu semantics,
 * portalling, keyboard nav and viewport-aware positioning.
 */
export function ActionsMenu({
  items,
  label = "Altre azioni",
  ...rest
}: ActionsMenuProps) {
  return (
    <DropdownMenu
      align="end"
      trigger={<Icon name="more" size={16} aria-hidden={true} />}
      triggerClassName={styles.trigger}
      triggerLabel={label}
      triggerTitle={label}
      items={items}
      data-testid={rest["data-testid"]}
    />
  );
}
