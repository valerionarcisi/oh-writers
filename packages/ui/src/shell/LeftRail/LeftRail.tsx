// packages/ui/src/shell/LeftRail/LeftRail.tsx
import { useRef } from "react";
import { useButton, useHover, useOverlay } from "react-aria";
import type { ReactNode } from "react";
import { Icon } from "../../icons/Icon";
import type { IconName } from "../../icons/icon-names";
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
};

export type RailToolItem = {
  id: string;
  label: string;
  icon: IconName;
  onPress: () => void;
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
  };
  /** Active project header. Clicking opens the project switcher (handled by
   *  the caller via the onProjectClick handler). */
  project?: {
    title: string;
    onPress?: () => void;
  };
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

function SessionItemButton({
  session,
  onActivate,
}: {
  session: CesareSessionItem;
  onActivate: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
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
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={cls}
      data-session-id={session.id}
    >
      <RailGlyph icon="agent-spark" />
      <span className={styles.itemLabel}>{session.title}</span>
      <span className={styles.itemMeta}>{session.lastAt}</span>
    </button>
  );
}

// The "Sessioni Cesare" section title. When `onOpen` is provided it is a
// react-aria button that navigates to the full Cesare sessions page; otherwise
// it is plain, non-interactive text.
function SessionsSectionTitle({ onOpen }: { onOpen?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: onOpen ?? (() => undefined),
      // Distinct from the BottomDock pill's "Apri Cesare" — the rail entry
      // opens the full sessions page, the dock pill opens the floating chat.
      // A shared accessible name would make both ambiguous to assistive tech
      // and to E2E locators.
      "aria-label": "Apri sessioni Cesare",
      isDisabled: !onOpen,
    },
    ref,
  );
  if (!onOpen) return <span>Sessioni Cesare</span>;
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.sessionsTitle}
      data-testid="rail-cesare-entry"
    >
      <RailGlyph icon="agent-spark" />
      <span>Sessioni Cesare</span>
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

// Inline gear icon — `settings` isn't in the sprite (see icon-names.ts), so we
// render the SVG directly. Same visual as the BottomDock gear.
function GearGlyph() {
  return (
    <svg
      width="15"
      height="15"
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

// Account footer row — bell / avatar / gear. Each is a react-aria button so
// keyboard + focus handling matches the rest of the rail.
function AccountRow({ account }: { account: RailAccountActions }) {
  const bellRef = useRef<HTMLButtonElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: bellProps } = useButton(
    {
      onPress: account.onBell,
      "aria-label": account.hasUnreadNotifications
        ? "Notifiche — nuove"
        : "Notifiche",
    },
    bellRef,
  );
  const { buttonProps: avatarProps } = useButton(
    { onPress: account.onAvatar, "aria-label": "Profilo" },
    avatarRef,
  );
  const { buttonProps: gearProps } = useButton(
    { onPress: account.onGear, "aria-label": "Impostazioni" },
    gearRef,
  );
  return (
    <div
      className={styles.account}
      role="toolbar"
      aria-label="Account"
      data-testid="rail-account"
    >
      <button
        ref={bellRef}
        {...bellProps}
        className={styles.accountBtn}
        title="Notifiche"
        data-rail-account="bell"
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
        title="Profilo"
        data-rail-account="avatar"
      >
        <span aria-hidden="true">{account.avatarLabel}</span>
      </button>
      <button
        ref={gearRef}
        {...gearProps}
        className={styles.accountBtn}
        title="Impostazioni"
        data-rail-account="gear"
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

export function LeftRail({
  brand,
  project,
  sections,
  sessions,
  onSessionSelect,
  onSessionNew,
  onSessionsOpen,
  onNavigate,
  account,
  tools,
  ariaLabel,
  overlay,
  onCollapse,
}: LeftRailProps) {
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
      "aria-label": project ? `Progetto: ${project.title}` : "Progetto",
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
    return (
      <section className={styles.section} data-rail-section="sessions">
        <header className={styles.sectionLabel}>
          <SessionsSectionTitle onOpen={onSessionsOpen} />
          {onSessionNew && (
            <button
              type="button"
              className={styles.newSession}
              onClick={onSessionNew}
              aria-label="Nuova sessione Cesare"
            >
              + Nuova
            </button>
          )}
        </header>
        {hasSessions && (
          <div className={styles.sessions}>
            {sessions!.map((s) => (
              <SessionItemButton
                key={s.id}
                session={s}
                onActivate={() => onSessionSelect?.(s.id)}
              />
            ))}
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
      aria-label={ariaLabel ?? "Navigazione progetto"}
      data-testid="left-rail"
    >
      <div className={styles.brandRow}>
        <button
          ref={brandRef}
          {...brandBtnProps}
          className={styles.brand}
          data-rail-brand=""
        >
          <span className={styles.brandMark} aria-hidden="true">
            O
          </span>
          <span className={styles.brandName}>{brand.label}</span>
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

      {project && (
        <button
          ref={projectRef}
          {...projectBtnProps}
          className={styles.project}
          data-rail-project=""
        >
          <span className={styles.projectTitle}>{project.title}</span>
          <span className={styles.projectChev} aria-hidden="true">
            <Icon name="chevron-down" size={12} aria-hidden={true} />
          </span>
        </button>
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

      {account && <AccountRow account={account} />}

      {tools && tools.length > 0 && (
        <div className={styles.tools} role="toolbar" aria-label="Strumenti">
          {tools.map((tool) => (
            <ToolButton key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </aside>
  );
}
