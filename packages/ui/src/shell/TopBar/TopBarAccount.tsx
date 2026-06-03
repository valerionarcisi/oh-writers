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
import { GearGlyph } from "./GearGlyph";
import styles from "./TopBarAccount.module.css";

export type TopBarAccountActions = {
  /** Open the notification centre (SplitDrawer). */
  onBell: () => void;
  /** Open user settings (avatar). */
  onAvatar: () => void;
  /** Open project settings (gear). */
  onGear: () => void;
  /** Renders the unread dot on the bell. */
  hasUnreadNotifications: boolean;
  /** 1–2 letter initials shown in the avatar circle. */
  avatarLabel: string;
};

export type TopBarAccountLabels = {
  notifications: string;
  notificationsUnread: string;
  profile: string;
  settings: string;
  account: string;
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
    { onPress: account.onGear, "aria-label": labels.settings },
    gearRef,
  );

  return (
    <div
      className={styles.account}
      role="toolbar"
      aria-label={labels.account}
      data-testid="topbar-account"
    >
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
    </div>
  );
}
