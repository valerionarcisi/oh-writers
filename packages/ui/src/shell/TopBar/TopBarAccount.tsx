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

import { useRef, useState } from "react";
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
  /** 1–2 letter initials shown in the avatar circle when no image is set
   *  (also the alt text and fallback if the image fails to load). */
  avatarLabel: string;
  /** Profile photo URL (own upload or the OAuth provider's avatar), or
   *  `null` when the account has none. When present, shown instead of the
   *  initials; falls back to initials on a load error (broken URL, revoked
   *  provider image, offline). */
  avatarImageUrl: string | null;
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

// Shows the profile photo when set; falls back to initials on missing URL or
// a failed image load (broken link, revoked OAuth avatar, offline).
function AvatarGlyph({
  imageUrl,
  label,
}: {
  imageUrl: string | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={label}
        className={styles.accountAvatarImg}
        onError={() => setFailed(true)}
        // Google's avatar CDN (lh3.googleusercontent.com) rejects the
        // request when it carries a cross-origin Referer, which the browser
        // then renders as its own broken-image icon rather than firing
        // onError with a graceful fallback. no-referrer avoids that.
        referrerPolicy="no-referrer"
      />
    );
  }
  return <span aria-hidden="true">{label}</span>;
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
          trigger={
            <AvatarGlyph
              imageUrl={account.avatarImageUrl}
              label={account.avatarLabel}
            />
          }
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
          <AvatarGlyph
            imageUrl={account.avatarImageUrl}
            label={account.avatarLabel}
          />
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
