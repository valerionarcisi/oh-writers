// packages/ui/src/shell/TopBar/TopBarAccount.tsx
//
// The shell-level account zone for the TopBar right slot (Spec 55). It is the
// single home for the bell (notifications) + avatar (user settings) + gear
// (project settings) — superseding the LeftRail footer AccountRow (Spec 47b).
// Avatar and gear are DISTINCT destinations (BUGS N-22): avatar opens user
// settings, gear opens project settings.
//
// All three triggers go through `react-aria`'s `useButton` for correct focus +
// keyboard semantics. The testids match the legacy AccountRow
// (`notifications-btn` / `profile-btn` / `settings-btn`) so the move is
// transparent to existing E2E selectors.

import { useRef } from "react";
import { useButton } from "react-aria";
import { Icon } from "../../icons/Icon";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "../../components/DropdownMenu";
import { GearGlyph } from "./GearGlyph";
import styles from "./TopBarAccount.module.css";

export type TopBarAccountActions = {
  /** Open the notification centre (SplitDrawer). */
  onBell: () => void;
  /** Open user settings (avatar). Ignored when `avatarMenuItems` is provided. */
  onAvatar: () => void;
  /** When provided, the avatar opens a dropdown (settings + sign out) instead
   *  of navigating straight to settings. Signing out has to live on a surface
   *  that is always on screen — it had no home at all after the avatar moved
   *  here from the BottomDock (issue #113). */
  avatarMenuItems?: DropdownMenuItem[];
  /** Open project settings (gear). Omitted (no project open) → the gear is
   *  hidden: outside a project it would only duplicate the avatar. */
  onGear?: () => void;
  /** When provided, the gear opens a dropdown menu (pages + settings + AI)
   *  instead of navigating directly; `onGear` is ignored. */
  gearMenuItems?: DropdownMenuItem[];
  /** Renders the unread dot on the bell. */
  hasUnreadNotifications: boolean;
  /** 1–2 letter initials shown in the avatar circle. */
  avatarLabel: string;
  /** Toggle the SplitDrawer (⊟, Claude-style). Omitted → the toggle is hidden.
   *  When `canToggleSplit` is false the button renders disabled. */
  onToggleSplit?: () => void;
  /** Whether the SplitDrawer is currently open (drives the toggle's pressed state). */
  splitOpen?: boolean;
  /** Whether there is split content to toggle (drives the button's enabled state). */
  canToggleSplit?: boolean;
};

export type TopBarAccountLabels = {
  notifications: string;
  notificationsUnread: string;
  profile: string;
  settings: string;
  account: string;
  toggleSplit: string;
};

export interface TopBarAccountProps {
  account: TopBarAccountActions;
  labels: TopBarAccountLabels;
}

export function TopBarAccount({ account, labels }: TopBarAccountProps) {
  const bellRef = useRef<HTMLButtonElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);

  const { buttonProps: bellProps } = useButton(
    {
      onPress: account.onBell,
      "aria-label": account.hasUnreadNotifications
        ? labels.notificationsUnread
        : labels.notifications,
    },
    bellRef,
  );
  const { buttonProps: avatarProps } = useButton(
    { onPress: account.onAvatar, "aria-label": labels.profile },
    avatarRef,
  );
  const { buttonProps: gearProps } = useButton(
    {
      onPress: account.onGear ?? (() => undefined),
      "aria-label": labels.settings,
    },
    gearRef,
  );
  const splitRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: splitProps } = useButton(
    {
      onPress: account.onToggleSplit ?? (() => undefined),
      "aria-label": labels.toggleSplit,
      isDisabled: !account.canToggleSplit,
    },
    splitRef,
  );

  return (
    <div
      className={styles.account}
      role="toolbar"
      aria-label={labels.account}
      data-testid="topbar-account"
    >
      {account.onToggleSplit && (
        <button
          ref={splitRef}
          {...splitProps}
          className={styles.accountBtn}
          title={labels.toggleSplit}
          aria-pressed={account.splitOpen ?? false}
          data-topbar-account="split"
          data-testid="topbar-split-toggle"
        >
          <span aria-hidden="true">◫</span>
        </button>
      )}
      <button
        ref={bellRef}
        {...bellProps}
        className={styles.accountBtn}
        title={labels.notifications}
        data-topbar-account="bell"
        data-testid="notifications-btn"
      >
        <Icon name="bell" size={15} aria-hidden={true} />
        {account.hasUnreadNotifications && (
          <span className={styles.accountDot} aria-hidden="true" />
        )}
      </button>
      {account.avatarMenuItems ? (
        <DropdownMenu
          trigger={<span aria-hidden="true">{account.avatarLabel}</span>}
          items={account.avatarMenuItems}
          align="end"
          triggerClassName={[styles.accountBtn, styles.accountAvatar].join(" ")}
          triggerLabel={labels.account}
          triggerTestId="profile-btn"
        />
      ) : (
        <button
          ref={avatarRef}
          {...avatarProps}
          className={[styles.accountBtn, styles.accountAvatar].join(" ")}
          title={labels.profile}
          data-topbar-account="avatar"
          data-testid="profile-btn"
        >
          <span aria-hidden="true">{account.avatarLabel}</span>
        </button>
      )}
      {account.gearMenuItems ? (
        <DropdownMenu
          trigger={<GearGlyph />}
          items={account.gearMenuItems}
          align="end"
          triggerClassName={styles.accountBtn}
          triggerLabel={labels.settings}
          triggerTitle={labels.settings}
          triggerTestId="settings-btn"
          data-testid="gear-menu"
        />
      ) : account.onGear ? (
        <button
          ref={gearRef}
          {...gearProps}
          className={styles.accountBtn}
          title={labels.settings}
          data-topbar-account="gear"
          data-testid="settings-btn"
        >
          <GearGlyph />
        </button>
      ) : null}
    </div>
  );
}
