// packages/ui/src/shell/LeftRail/LeftRail.tsx
import { useLayoutEffect, useRef, useState } from "react";
import { useButton, useHover, useOverlay, useTextField } from "react-aria";
import type { ReactNode } from "react";
import { Icon } from "../../icons/Icon";
import type { IconName } from "../../icons/icon-names";
import { DropdownMenu } from "../../components/DropdownMenu";
import type { DropdownMenuItem } from "../../components/DropdownMenu";
import { GearGlyph } from "../TopBar/GearGlyph";
import { BrandWordmark, BrandBadge } from "../../brand/BrandAssets";
import styles from "./LeftRail.module.css";

export type RailNavItem = {
  /** Stable id, also used as the active match key */
  id: string;
  label: string;
  href: string;
  /** Display glyph — either an IconName (preferred) or a short unicode glyph
   *  for legacy icons not yet in the sprite. */
  icon: IconName | string;
  isActive?: boolean;
  /** Optional trailing meta string (e.g. relative time for Recents) */
  meta?: string;
};

export type RailSection = {
  label: string;
  items: ReadonlyArray<RailNavItem>;
};

export type CesareSessionItem = {
  id: string;
  title: string;
  /** Relative time label, e.g. "ora", "2h", "ieri" */
  lastAt: string;
  active?: boolean;
  /** True when the session is pinned — sorts first and shows the pin glyph. */
  pinned?: boolean;
};

export type RailToolItem = {
  id: string;
  label: string;
  icon: IconName;
  onPress: () => void;
};

// User-facing labels for the rail chrome. Every field is optional with its
// current IT value as default so `packages/ui` stays framework-agnostic (no
// i18n import); the app passes translated values via `useTranslation`.
export type RailLabels = {
  /** Section title for the Cesare sessions slot. */
  sessionsTitle?: string;
  /** Aria-label for the clickable sessions title (opens the sessions page). */
  sessionsOpen?: string;
  /** Aria-label + title for the notifications bell. */
  notifications?: string;
  /** Aria-label for the notifications bell when there are unread items. */
  notificationsUnread?: string;
  /** Aria-label + title for the settings gear. */
  settings?: string;
  /** Aria-label for the project header button when no project is set. */
  projectFallback?: string;
  /** Aria-label for the "new Cesare session" affordance. */
  newSession?: string;
  /** Aria-label for the rail navigation landmark. */
  nav?: string;
  /** Label for the "pin session" row-menu action. */
  pinSession?: string;
  /** Label for the "unpin session" row-menu action. */
  unpinSession?: string;
  /** Visible label for the "Vedi tutte (N)" link shown when the rail caps the
   *  session list. `{n}` is replaced with the total session count. */
  seeAllSessions?: string;
  /** Visible label for the "new session" button (the "+ Nuova" pill). */
  newSessionShort?: string;
  /** Aria-labels for the footer account row + tools toolbar. */
  profile?: string;
  account?: string;
  tools?: string;
};

// Account row that lives in the rail FOOTER (Spec 47b FIX 1): notifications /
// profile / settings. These used to sit in the BottomDock + the Cesare header
// overflow; they now have a single home here so neither surface duplicates them.
export type RailAccountActions = {
  /** Open the notifications drawer. */
  onBell: () => void;
  /** Open the profile / account menu. */
  onAvatar: () => void;
  /** Open settings. */
  onGear: () => void;
  /** Red dot on the bell when there are unseen notifications. */
  hasUnreadNotifications?: boolean;
  /** Avatar initials shown on the profile button. */
  avatarLabel: string;
};

export type LeftRailProps = {
  /** Brand mark — clicking returns to dashboard */
  brand: {
    label: string;
    onPress: () => void;
    /** Whether to render the brand wordmark text next to the "O" mark. When
     *  false the mark stands alone (BUGS N-21 — the "Oh Writers" wordmark is
     *  redundant when no project is selected). Defaults to true. */
    showLabel?: boolean;
  };
  /** Active project header. The chevron-down glyph promises a menu, so when
   *  `menuItems` is supplied the header renders as a `DropdownMenu` trigger
   *  (open project / project settings / switch project — N-24). When only
   *  `onPress` is supplied the header is a single-action button (legacy). */
  project?: {
    title: string;
    onPress?: () => void;
    /** Project actions surfaced in the header dropdown. When non-empty the
     *  header opens this menu instead of firing `onPress`. */
    menuItems?: ReadonlyArray<DropdownMenuItem>;
  };
  /** Standalone "Home" entry, rendered above the labelled sections — always
   *  present regardless of project context (unlike `sections`, which is
   *  empty outside a project). A single unlabelled row, not a section. */
  home?: RailNavItem;
  /** Sviluppo / Produzione / Recenti — each rendered as a labelled section.
   *  Section ordering is preserved. */
  sections: ReadonlyArray<RailSection>;
  /** Cesare sessions — when provided, the rail always surfaces a "Sessioni
   *  Cesare" section above the primary nav (Spec 44 F1), independent of
   *  whether the Cesare drawer is open. The section self-hides only when
   *  there are no sessions to show. */
  sessions?: ReadonlyArray<CesareSessionItem>;
  /** Click handler when the user activates a session row. */
  onSessionSelect?: (sessionId: string) => void;
  /** Commit a new title for a session (inline rename — Spec 53). When omitted,
   *  the rename affordance is hidden. The rail owns the in-place edit state
   *  (input, Enter/blur commit, Esc cancel); this just persists the result. */
  onSessionRename?: (sessionId: string, title: string) => void;
  /** Request deletion of a session (Spec 53). When omitted, the delete
   *  affordance is hidden. The rail does NOT confirm — it asks the consumer to
   *  open the confirmation modal (DS Dialog) and run the mutation. */
  onSessionDelete?: (sessionId: string) => void;
  /** Toggle pin/unpin for a session. When omitted, the pin affordance is
   *  hidden. The rail does not enforce the max-3 cap — the consumer runs the
   *  mutation and surfaces the limit feedback (toast) on rejection. */
  onSessionPin?: (sessionId: string, pinned: boolean) => void;
  /** Click handler for the "+ Nuova" affordance in the sessions section
   *  label. Optional — when omitted, the affordance is hidden. */
  onSessionNew?: () => void;
  /** Spec 47-A5 — opens the full Cesare sessions page (the central
   *  `/projects/:id/sessions` landing). Renders the "Sessioni Cesare" section
   *  title as a clickable entry. When omitted, the title is plain text.
   *  The section is always rendered when this is provided, even with zero
   *  sessions, so the dedicated Cesare entry is reachable from an empty list. */
  onSessionsOpen?: () => void;
  /** Click handler for navigating to a primary nav item. The href is
   *  passed through so the caller can integrate with the router of its
   *  choice (TanStack Router today, anything tomorrow). */
  onNavigate: (href: string) => void;
  /** Account actions row in the rail FOOTER (Spec 47b FIX 1): bell / avatar /
   *  gear. The single home for these icons — the BottomDock and Cesare header
   *  no longer render them. */
  account?: RailAccountActions;
  /** Tool icons row at the bottom of the rail (search / new / switch / more). */
  tools?: ReadonlyArray<RailToolItem>;
  /** Optional aria-label override for the rail nav landmark. */
  ariaLabel?: string;
  /** Translated chrome labels. Optional — each field defaults to its IT value
   *  so the rail renders correctly without a translator. */
  labels?: RailLabels;
  /** Collapse the shell from inside the rail. When provided (full mode only),
   *  the brand row surfaces a hover-revealed `«` button at its trailing edge.
   *  Mutually exclusive with `overlay` — `overlay` is only supplied in the
   *  collapsed state, where the `»` pin owns the same slot. */
  onCollapse?: () => void;
  /** Overlay mode props — supplied by AppShell when `data-shell="collapsed"`.
   *  When provided, the rail behaves as a dismissible overlay: outside-click
   *  + ESC fire `onDismiss`; a top-right `«` button mirrors that dismiss;
   *  the optional `onLockOpen` chip switches the shell back to `full`.
   *  When omitted, the rail is rendered statically (full mode). */
  overlay?: {
    /** True when the overlay is currently visible. Drives outside-click +
     *  ESC listeners via react-aria's `useOverlay`. */
    isOpen: boolean;
    /** Called when the user clicks outside the rail, presses ESC, or hits
     *  the `«` close button. */
    onDismiss: () => void;
    /** Optional — when provided, the rail surfaces a `»` chip that locks
     *  the rail open (caller flips shell state back to `full`). */
    onLockOpen?: () => void;
    /** Called when the pointer enters the rail panel — cancels a pending
     *  scheduled close so the overlay stays open while the user browses. */
    onHoverEnter?: () => void;
    /** Called when the pointer leaves the rail panel — schedules the delayed
     *  close so the overlay fades after CLOSE_DELAY_MS. */
    onHoverLeave?: () => void;
  };
};

// React-aria button wrapper for rail rows. Keeps the spread surface narrow
// (label + glyph + optional meta) so the rail can stay visually consistent
// across sections.
function RailItemButton({
  item,
  onActivate,
}: {
  item: RailNavItem;
  onActivate: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: onActivate,
      "aria-label": item.label,
      "aria-current": item.isActive ? "page" : undefined,
    },
    ref,
  );
  const cls = [styles.item, item.isActive ? styles.itemActive : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} {...buttonProps} className={cls} data-rail-item={item.id}>
      <RailGlyph icon={item.icon} />
      <span className={styles.itemLabel}>{item.label}</span>
      {item.meta && <span className={styles.itemMeta}>{item.meta}</span>}
    </button>
  );
}

// Inline rename input (Spec 53). A controlled react-aria text field — keyboard
// handling (Enter commits, Esc cancels) is wired here, with focus/aria managed
// by `useTextField` so we never re-implement input semantics by hand. Commits on
// blur as well, matching the Notion-style affordance.
function SessionRenameInput({
  initialTitle,
  onCommit,
  onCancel,
}: {
  initialTitle: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialTitle);
  // Guard so a blur fired by our own commit/cancel doesn't double-fire.
  const settledRef = useRef(false);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const next = value.trim();
    if (next.length > 0 && next !== initialTitle) onCommit(next);
    else onCancel();
  };
  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  const { inputProps } = useTextField(
    {
      value,
      onChange: setValue,
      "aria-label": "Rinomina sessione",
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      },
      onBlur: commit,
    },
    ref,
  );

  // Focus + select on mount so the user can type over the placeholder title.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      {...inputProps}
      ref={ref}
      className={styles.sessionRename}
      data-testid="session-rename-input"
    />
  );
}

function SessionRow({
  session,
  onActivate,
  onRename,
  onDelete,
  onPin,
  pinLabel,
  unpinLabel,
}: {
  session: CesareSessionItem;
  onActivate: () => void;
  onRename?: (title: string) => void;
  onDelete?: () => void;
  onPin?: (pinned: boolean) => void;
  pinLabel?: string;
  unpinLabel?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [isEditing, setEditing] = useState(false);
  const { buttonProps } = useButton(
    {
      onPress: onActivate,
      "aria-label": `Sessione Cesare: ${session.title}`,
      "aria-current": session.active ? "page" : undefined,
    },
    ref,
  );
  const cls = [styles.session, session.active ? styles.sessionActive : ""]
    .filter(Boolean)
    .join(" ");

  // Build the …-menu items from the wired affordances. Rename starts the inline
  // edit; delete asks the consumer to open the confirmation modal; pin/unpin
  // toggles based on the session's current state.
  const menuItems = [
    onPin
      ? {
          label: session.pinned
            ? (unpinLabel ?? "Rimuovi dai fissati")
            : (pinLabel ?? "Fissa in alto"),
          onClick: () => onPin(!session.pinned),
          testId: "session-pin-item",
        }
      : null,
    onRename
      ? {
          label: "Rinomina",
          onClick: () => setEditing(true),
          testId: "session-rename-item",
        }
      : null,
    onDelete
      ? { label: "Elimina", onClick: onDelete, testId: "session-delete-item" }
      : null,
  ].filter(
    (it): it is { label: string; onClick: () => void; testId: string } =>
      it !== null,
  );
  const hasMenu = menuItems.length > 0;

  if (isEditing && onRename) {
    return (
      <div
        className={[styles.session, styles.sessionEditing].join(" ")}
        data-session-id={session.id}
        data-editing="true"
      >
        <RailGlyph icon="agent-spark" />
        <SessionRenameInput
          initialTitle={session.title}
          onCommit={(title) => {
            setEditing(false);
            onRename(title);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div
      className={styles.sessionRow}
      data-session-id={session.id}
      data-session-pinned={session.pinned ? "true" : undefined}
    >
      <button
        ref={ref}
        {...buttonProps}
        className={cls}
        // Double-click is the secondary rename affordance (the …-menu is the
        // primary one). Only when renaming is wired.
        onDoubleClick={onRename ? () => setEditing(true) : undefined}
        data-session-button=""
      >
        <RailGlyph icon="agent-spark" />
        <span className={styles.itemLabel}>{session.title}</span>
        {session.pinned && (
          <Icon
            name="pin"
            size={11}
            aria-hidden={true}
            className={styles.sessionPinGlyph}
          />
        )}
        <span className={styles.itemMeta}>{session.lastAt}</span>
      </button>
      {hasMenu && (
        <DropdownMenu
          align="end"
          trigger={
            <span className={styles.sessionMore} aria-hidden="true">
              ⋯
            </span>
          }
          triggerLabel={`Azioni sessione: ${session.title}`}
          triggerClassName={styles.sessionMoreBtn}
          triggerTitle="Azioni sessione"
          triggerTestId="session-actions-btn"
          data-testid="session-actions-menu"
          items={menuItems}
        />
      )}
    </div>
  );
}

// The "Sessioni Cesare" section title. When `onOpen` is provided it is a
// react-aria button that navigates to the full Cesare sessions page; otherwise
// it is plain, non-interactive text.
function SessionsSectionTitle({
  onOpen,
  title,
  openLabel,
}: {
  onOpen?: () => void;
  title: string;
  openLabel: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: onOpen ?? (() => undefined),
      // Distinct from the BottomDock pill's "Apri Cesare" — the rail entry
      // opens the full sessions page, the dock pill opens the floating chat.
      // A shared accessible name would make both ambiguous to assistive tech
      // and to E2E locators.
      "aria-label": openLabel,
      isDisabled: !onOpen,
    },
    ref,
  );
  if (!onOpen) return <span data-testid="rail-sessions-title">{title}</span>;
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.sessionsTitle}
      data-testid="rail-cesare-entry"
    >
      <RailGlyph icon="agent-spark" />
      <span data-testid="rail-sessions-title">{title}</span>
    </button>
  );
}

// "Vedi tutte (N)" — shown below the capped session list, styled like the
// rail's other secondary links. Navigates to the full Cesare sessions page
// (same destination as the section title's `onOpen`).
function SeeAllSessionsLink({
  onOpen,
  label,
}: {
  onOpen: () => void;
  label: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress: onOpen, "aria-label": label },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={styles.seeAllSessions}
      data-testid="rail-sessions-see-all"
    >
      {label}
    </button>
  );
}

function ToolButton({ tool }: { tool: RailToolItem }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: tool.onPress,
      "aria-label": tool.label,
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.tool}
      title={tool.label}
      data-tool-id={tool.id}
    >
      <Icon name={tool.icon} size={14} aria-hidden={true} />
    </button>
  );
}

// Account footer row — bell / avatar / gear. Each is a react-aria button so
// keyboard + focus handling matches the rest of the rail.
function AccountRow({
  account,
  notificationsLabel,
  notificationsUnreadLabel,
  settingsLabel,
  profileLabel,
  accountLabel,
}: {
  account: RailAccountActions;
  notificationsLabel: string;
  notificationsUnreadLabel: string;
  settingsLabel: string;
  profileLabel: string;
  accountLabel: string;
}) {
  const bellRef = useRef<HTMLButtonElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: bellProps } = useButton(
    {
      onPress: account.onBell,
      "aria-label": account.hasUnreadNotifications
        ? notificationsUnreadLabel
        : notificationsLabel,
    },
    bellRef,
  );
  const { buttonProps: avatarProps } = useButton(
    { onPress: account.onAvatar, "aria-label": profileLabel },
    avatarRef,
  );
  const { buttonProps: gearProps } = useButton(
    { onPress: account.onGear, "aria-label": settingsLabel },
    gearRef,
  );
  return (
    <div
      className={styles.account}
      role="toolbar"
      aria-label={accountLabel}
      data-testid="rail-account"
    >
      <button
        ref={bellRef}
        {...bellProps}
        className={styles.accountBtn}
        title={notificationsLabel}
        data-rail-account="bell"
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
        title={profileLabel}
        data-rail-account="avatar"
        data-testid="profile-btn"
      >
        <span aria-hidden="true">{account.avatarLabel}</span>
      </button>
      <button
        ref={gearRef}
        {...gearProps}
        className={styles.accountBtn}
        title={settingsLabel}
        data-rail-account="gear"
        data-testid="settings-btn"
      >
        <GearGlyph />
      </button>
    </div>
  );
}

// Glyph wrapper that renders a sprite icon when the value matches a known
// IconName, otherwise falls back to plain text (covers legacy unicode glyphs
// not yet on the sprite — e.g. ✦ for sessions). The agent-spark token is
// special-cased to keep WP-B's tooling simple even when an icon isn't on
// the sprite yet.
function RailGlyph({ icon }: { icon: string }) {
  if (icon === "agent-spark") {
    return (
      <span className={styles.glyph} aria-hidden="true">
        ✦
      </span>
    );
  }
  // Render as Icon when it looks like a known sprite token (single word,
  // dash-separated). Otherwise treat it as a literal glyph.
  const isSpriteToken = /^[a-z][a-z0-9-]*$/.test(icon);
  if (isSpriteToken) {
    return (
      <span className={styles.glyph} aria-hidden="true">
        <Icon name={icon as IconName} size={14} aria-hidden={true} />
      </span>
    );
  }
  return (
    <span className={styles.glyph} aria-hidden="true">
      {icon}
    </span>
  );
}
// Rail visible-rows policy: at most 3 pinned + as many unpinned as fit,
// capped at 5 rows total. When the full session list exceeds 5, the rail
// shows the capped slice plus a "Vedi tutte (N)" link to the full sessions
// page. `sessions` is expected pre-sorted pinned-first (the server fn already
// orders `pinned_at desc, last_message_at desc`), so pinned rows are simply
// the leading run.
const MAX_RAIL_ROWS = 5;
const MAX_RAIL_PINNED = 3;

function visibleRailSessions(sessions: ReadonlyArray<CesareSessionItem>): {
  visible: ReadonlyArray<CesareSessionItem>;
  hasMore: boolean;
} {
  if (sessions.length <= MAX_RAIL_ROWS) {
    return { visible: sessions, hasMore: false };
  }
  const pinned = sessions.filter((s) => s.pinned).slice(0, MAX_RAIL_PINNED);
  const unpinned = sessions.filter((s) => !s.pinned);
  const remainingSlots = Math.max(0, MAX_RAIL_ROWS - pinned.length);
  return {
    visible: [...pinned, ...unpinned.slice(0, remainingSlots)],
    hasMore: true,
  };
}

export function LeftRail({
  brand,
  project,
  home,
  sections,
  sessions,
  onSessionSelect,
  onSessionRename,
  onSessionDelete,
  onSessionPin,
  onSessionNew,
  onSessionsOpen,
  onNavigate,
  account,
  tools,
  ariaLabel,
  labels,
  overlay,
  onCollapse,
}: LeftRailProps) {
  const sessionsTitleLabel = labels?.sessionsTitle ?? "Sessioni Cesare";
  const sessionsOpenLabel = labels?.sessionsOpen ?? "Apri sessioni Cesare";
  const notificationsLabel = labels?.notifications ?? "Notifiche";
  const notificationsUnreadLabel =
    labels?.notificationsUnread ?? "Notifiche — nuove";
  const settingsLabel = labels?.settings ?? "Impostazioni";
  const projectFallbackLabel = labels?.projectFallback ?? "Progetto";
  const newSessionLabel = labels?.newSession ?? "Nuova sessione Cesare";
  const navLabel = labels?.nav ?? "Navigazione progetto";
  const pinSessionLabel = labels?.pinSession ?? "Fissa in alto";
  const unpinSessionLabel = labels?.unpinSession ?? "Rimuovi dai fissati";
  const seeAllSessionsLabel = labels?.seeAllSessions ?? "Vedi tutte ({n})";
  const newSessionShortLabel = labels?.newSessionShort ?? "+ Nuova";
  const profileLabel = labels?.profile ?? "Profilo";
  const accountLabel = labels?.account ?? "Account";
  const toolsLabel = labels?.tools ?? "Strumenti";
  const railRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: brandBtnProps } = useButton(
    { onPress: brand.onPress, "aria-label": brand.label },
    brandRef,
  );
  const projectRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: projectBtnProps } = useButton(
    {
      onPress: project?.onPress ?? (() => undefined),
      "aria-label": project
        ? `Progetto: ${project.title}`
        : projectFallbackLabel,
      isDisabled: !project?.onPress,
    },
    projectRef,
  );
  const lockRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: lockBtnProps } = useButton(
    {
      onPress: overlay?.onLockOpen ?? (() => undefined),
      "aria-label": "Fissa sidebar (⌘\\)",
      isDisabled: !overlay?.onLockOpen,
    },
    lockRef,
  );
  const collapseRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: collapseBtnProps } = useButton(
    {
      onPress: onCollapse ?? (() => undefined),
      "aria-label": "Comprimi la barra laterale (⌘\\)",
      isDisabled: !onCollapse,
    },
    collapseRef,
  );

  // react-aria handles ESC + outside-click for the overlay case. When the
  // rail is rendered statically (no `overlay` prop) the handler is a no-op,
  // matching `useOverlay`'s `isOpen: false` contract.
  const overlayActive = overlay?.isOpen ?? false;
  const dismissOverlay = overlay?.onDismiss ?? (() => undefined);

  // Anti-flicker bridge: keep the overlay open while the pointer is inside
  // the rail panel (cancels the hamburger's scheduleClose); schedule a close
  // when the pointer leaves (so it fades if not locked). No-op when not in
  // overlay mode.
  const { hoverProps: railHoverProps } = useHover({
    onHoverStart: overlay?.onHoverEnter
      ? () => overlay.onHoverEnter!()
      : undefined,
    onHoverEnd: overlay?.onHoverLeave
      ? () => overlay.onHoverLeave!()
      : undefined,
  });

  const { overlayProps } = useOverlay(
    {
      isOpen: overlayActive,
      onClose: dismissOverlay,
      isDismissable: true,
      shouldCloseOnBlur: false,
      isKeyboardDismissDisabled: false,
    },
    railRef,
  );

  const renderSessions = (): ReactNode => {
    const hasSessions = Boolean(sessions && sessions.length > 0);
    // Render the section when there's at least one session OR when a dedicated
    // "open Cesare page" entry is wired — so the Cesare entry stays reachable
    // even from an empty list.
    if (!hasSessions && !onSessionsOpen) return null;
    const { visible, hasMore } = hasSessions
      ? visibleRailSessions(sessions!)
      : { visible: [], hasMore: false };
    return (
      <section className={styles.section} data-rail-section="sessions">
        <header className={styles.sectionLabel}>
          <SessionsSectionTitle
            onOpen={onSessionsOpen}
            title={sessionsTitleLabel}
            openLabel={sessionsOpenLabel}
          />
          {onSessionNew && (
            <button
              type="button"
              className={styles.newSession}
              onClick={onSessionNew}
              aria-label={newSessionLabel}
              data-testid="new-session-btn"
            >
              {newSessionShortLabel}
            </button>
          )}
        </header>
        {hasSessions && (
          <div className={styles.sessions}>
            {visible.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onActivate={() => onSessionSelect?.(s.id)}
                onRename={
                  onSessionRename
                    ? (title) => onSessionRename(s.id, title)
                    : undefined
                }
                onDelete={
                  onSessionDelete ? () => onSessionDelete(s.id) : undefined
                }
                onPin={
                  onSessionPin
                    ? (pinned) => onSessionPin(s.id, pinned)
                    : undefined
                }
                pinLabel={pinSessionLabel}
                unpinLabel={unpinSessionLabel}
              />
            ))}
            {hasMore && onSessionsOpen && (
              <SeeAllSessionsLink
                onOpen={onSessionsOpen}
                label={seeAllSessionsLabel.replace(
                  "{n}",
                  String(sessions!.length),
                )}
              />
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <aside
      ref={railRef}
      {...overlayProps}
      {...railHoverProps}
      className={styles.rail}
      aria-label={ariaLabel ?? navLabel}
      data-testid="left-rail"
    >
      <div className={styles.brandRow}>
        <button
          ref={brandRef}
          {...brandBtnProps}
          className={styles.brand}
          data-rail-brand=""
        >
          <span
            className={[
              styles.brandLockup,
              brand.showLabel === false ? styles.brandCompact : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            <BrandWordmark className={styles.brandWordmark} />
            <BrandBadge className={styles.brandBadge} />
          </span>
        </button>
        {overlay?.onLockOpen && (
          <button
            ref={lockRef}
            {...lockBtnProps}
            className={styles.lockOpen}
            title="Fissa sidebar (⌘\)"
            data-testid="rail-lock-open"
          >
            »
          </button>
        )}
        {!overlay && onCollapse && (
          <button
            ref={collapseRef}
            {...collapseBtnProps}
            className={styles.collapse}
            title="Comprimi la barra laterale (⌘\)"
            data-testid="rail-collapse"
          >
            «
          </button>
        )}
      </div>

      {project &&
        (() => {
          // The header content (title + chevron) is identical whether the
          // header is a menu trigger or a single-action button — keep it DRY.
          const headerContent = (
            <>
              <span className={styles.projectTitle}>{project.title}</span>
              <span className={styles.projectChev} aria-hidden="true">
                <Icon name="chevron-down" size={12} aria-hidden={true} />
              </span>
            </>
          );
          // N-24 — the chevron-down promises a menu, so when actions are
          // supplied the header opens a DropdownMenu rather than firing a
          // single navigation.
          return project.menuItems && project.menuItems.length > 0 ? (
            <DropdownMenu
              items={[...project.menuItems]}
              align="start"
              triggerClassName={styles.project}
              triggerLabel={`Progetto: ${project.title}`}
              triggerTestId="rail-project-menu-trigger"
              data-testid="rail-project-menu"
              trigger={headerContent}
            />
          ) : (
            <button
              ref={projectRef}
              {...projectBtnProps}
              className={styles.project}
              data-rail-project=""
            >
              {headerContent}
            </button>
          );
        })()}

      {tools && tools.length > 0 && (
        <div className={styles.tools} role="toolbar" aria-label={toolsLabel}>
          {tools.map((tool) => (
            <ToolButton key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {home && (
        <div className={[styles.sectionItems, styles.homeRow].join(" ")}>
          <RailItemButton
            item={home}
            onActivate={() => onNavigate(home.href)}
          />
        </div>
      )}

      {/* Sessions slot — always visible (Spec 44 F1). The section itself
          renders null only when there are no sessions. */}
      <div className={styles.sessionsSlot}>{renderSessions()}</div>

      {sections.map((section) => (
        <section
          key={section.label}
          className={styles.section}
          data-rail-section={section.label.toLowerCase()}
        >
          <header className={styles.sectionLabel}>
            <span>{section.label}</span>
          </header>
          <div className={styles.sectionItems}>
            {section.items.map((item) => (
              <RailItemButton
                key={item.id}
                item={item}
                onActivate={() => onNavigate(item.href)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className={styles.spacer} />

      {account && (
        <AccountRow
          account={account}
          notificationsLabel={notificationsLabel}
          notificationsUnreadLabel={notificationsUnreadLabel}
          settingsLabel={settingsLabel}
          profileLabel={profileLabel}
          accountLabel={accountLabel}
        />
      )}
    </aside>
  );
}
