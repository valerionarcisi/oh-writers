// packages/ui/src/shell/BottomDock/BottomDock.tsx
import { useRef } from "react";
import { useButton } from "react-aria";
import { Icon } from "../../icons/Icon";
import { DropdownMenu } from "../../components/DropdownMenu";
import type { DropdownMenuItem } from "../../components/DropdownMenu";
import styles from "./BottomDock.module.css";

export type BottomDockUser = {
  initials: string;
  /** Optional avatar URL. When omitted, the dock renders the initials. */
  avatarUrl?: string;
};

export type BottomDockProps = {
  /** Active user — initials shown on the avatar button. */
  user: BottomDockUser;
  /** True when there are unseen notifications. Renders a red dot on the
   *  bell icon. The exact unread count lives behind the bell drawer. */
  hasUnseen?: boolean;
  /** Open the notifications drawer. */
  onBell: () => void;
  /** Click handler for the avatar button. Optional — when `userMenuItems`
   *  is provided, the avatar opens that dropdown directly. */
  onAvatar?: () => void;
  /** Click handler for the gear button (settings). */
  onSettings: () => void;
  /** Toggle the Cesare sub-window. */
  onCesareToggle: () => void;
  /** When provided, the avatar renders a DropdownMenu (sign-out, settings,
   *  presentazione…) instead of firing onAvatar. */
  userMenuItems?: ReadonlyArray<DropdownMenuItem>;
  /** When true (default), the Cesare label is shown next to the spark.
   *  Set to false to render an icon-only pill on tight screens. */
  showCesareLabel?: boolean;
};

function DockIconButton({
  icon,
  label,
  onPress,
  showDot,
  variant = "default",
}: {
  icon: "bell" | "settings";
  label: string;
  onPress: () => void;
  showDot?: boolean;
  variant?: "default";
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": label,
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.btn}
      data-variant={variant}
      title={label}
    >
      {icon === "bell" ? (
        <Icon name="bell" size={14} aria-hidden={true} />
      ) : (
        <SettingsGlyph />
      )}
      {showDot && <span className={styles.dot} aria-hidden="true" />}
    </button>
  );
}

function SettingsGlyph() {
  // Inline gear icon — `settings` isn't in the sprite yet (see icon-names.ts)
  // so we render the SVG directly. Same visual as the TopBar gear.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function AvatarButton({
  user,
  onPress,
}: {
  user: BottomDockUser;
  onPress: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": `Account (${user.initials})`,
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={[styles.btn, styles.avatar].join(" ")}
      title="Account"
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className={styles.avatarImg} />
      ) : (
        <span aria-hidden="true">{user.initials}</span>
      )}
    </button>
  );
}

function CesareButton({
  onPress,
  showLabel,
}: {
  onPress: () => void;
  showLabel: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": "Apri Cesare",
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.cesare}
      title="Apri Cesare"
      data-cesare-trigger=""
    >
      <span className={styles.cesareIcon} aria-hidden="true" />
      {showLabel && <span className={styles.cesareLabel}>Cesare</span>}
    </button>
  );
}

export function BottomDock({
  user,
  hasUnseen = false,
  onBell,
  onAvatar,
  onSettings,
  onCesareToggle,
  userMenuItems,
  showCesareLabel = true,
}: BottomDockProps) {
  const handleAvatarClick = onAvatar ?? (() => undefined);
  return (
    <div
      className={styles.dock}
      role="toolbar"
      aria-label="Azioni globali"
      data-testid="bottom-dock"
    >
      <DockIconButton
        icon="bell"
        label={hasUnseen ? "Notifiche — nuove" : "Notifiche"}
        onPress={onBell}
        showDot={hasUnseen}
      />
      {userMenuItems && userMenuItems.length > 0 ? (
        <DropdownMenu
          align="end"
          trigger={
            <button
              type="button"
              className={[styles.btn, styles.avatar].join(" ")}
              aria-label={`Account (${user.initials})`}
              title="Account"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className={styles.avatarImg} />
              ) : (
                <span aria-hidden="true">{user.initials}</span>
              )}
            </button>
          }
          items={[...userMenuItems]}
        />
      ) : (
        <AvatarButton user={user} onPress={handleAvatarClick} />
      )}
      <DockIconButton
        icon="settings"
        label="Impostazioni"
        onPress={onSettings}
      />
      <span className={styles.divider} aria-hidden="true" />
      <CesareButton onPress={onCesareToggle} showLabel={showCesareLabel} />
    </div>
  );
}
