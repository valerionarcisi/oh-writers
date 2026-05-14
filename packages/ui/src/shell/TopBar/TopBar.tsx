// packages/ui/src/shell/TopBar/TopBar.tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons/Icon";
import { SavePill } from "../../primitives/SavePill/SavePill";
import type { SaveState } from "../../primitives/SavePill/SavePill";
import { Presence } from "../../primitives/Presence/Presence";
import type { PresenceUser } from "../../primitives/Presence/Presence";
import styles from "./TopBar.module.css";

export type TopBarSection = {
  label: string;
  href: string;
  isActive?: boolean;
};

export type TopBarProps = {
  projectName: string;
  sectionName: string;
  /** Whether the page has scrolled past 0 — controls border-bottom appearance */
  isScrolled?: boolean;
  saveState?: SaveState;
  saveSecondsAgo?: number;
  /** Number of pending Cesare notes — controls the leaf dot animation */
  cesareNoteCount?: number;
  presenceUsers?: PresenceUser[];
  notificationCount?: number;
  userInitials: string;
  /** When provided, clicking the section breadcrumb opens a popover with these
   *  entries. Each entry navigates via onNavigate(href). */
  sections?: ReadonlyArray<TopBarSection>;
  onNavigate?: (href: string) => void;
  onBrandClick?: () => void;
  onProjectClick?: () => void;
  onSectionClick?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
  onAskCesare?: () => void;
  onAvatarClick?: () => void;
};

export function TopBar({
  projectName,
  sectionName,
  isScrolled = false,
  saveState = "saved",
  saveSecondsAgo,
  cesareNoteCount = 0,
  presenceUsers = [],
  notificationCount = 0,
  userInitials,
  sections,
  onNavigate,
  onBrandClick,
  onProjectClick,
  onSectionClick,
  onSearch,
  onBell,
  onAskCesare,
  onAvatarClick,
}: TopBarProps) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const sectionWrapRef = useRef<HTMLSpanElement>(null);
  const hasSectionMenu = sections !== undefined && sections.length > 0;

  useEffect(() => {
    if (!sectionsOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (
        sectionWrapRef.current &&
        !sectionWrapRef.current.contains(e.target as Node)
      ) {
        setSectionsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSectionsOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sectionsOpen]);

  const handleSectionTriggerClick = () => {
    if (hasSectionMenu) {
      setSectionsOpen((v) => !v);
      return;
    }
    onSectionClick?.();
  };

  const handleSectionPick = (href: string) => {
    setSectionsOpen(false);
    onNavigate?.(href);
  };

  return (
    <header
      className={[styles.topbar, isScrolled ? styles.isScrolled : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Brand mark */}
      <button
        type="button"
        className={styles.brandMark}
        onClick={onBrandClick}
        aria-label="Oh Writers — apri Cesare"
        aria-expanded="false"
        aria-haspopup="dialog"
      >
        <span className={styles.brandLetter} aria-hidden="true">
          O
        </span>
        {cesareNoteCount > 0 && (
          <span
            className={[styles.cesareDot, styles.cesareDotActive].join(" ")}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Project breadcrumb */}
      <span className={styles.breadcrumbSep} aria-hidden="true">
        /
      </span>
      <button
        type="button"
        className={styles.breadcrumbBtn}
        onClick={onProjectClick}
        aria-label={`Progetto: ${projectName} — cambia progetto`}
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span className={styles.projectName}>{projectName}</span>
        <Icon name="chevron-down" size={12} aria-hidden={true} />
      </button>

      <span className={styles.breadcrumbSep} aria-hidden="true">
        /
      </span>
      <span className={styles.sectionWrap} ref={sectionWrapRef}>
        <button
          type="button"
          className={styles.breadcrumbBtn}
          onClick={handleSectionTriggerClick}
          aria-label={`Sezione: ${sectionName} — cambia sezione`}
          aria-haspopup={hasSectionMenu ? "menu" : "listbox"}
          aria-expanded={sectionsOpen}
          data-testid="topbar-section-trigger"
        >
          <span className={styles.sectionName}>{sectionName}</span>
          <Icon name="chevron-down" size={12} aria-hidden={true} />
        </button>
        {hasSectionMenu && sectionsOpen && (
          <div
            role="menu"
            className={styles.sectionPopover}
            data-testid="topbar-section-popover"
          >
            {sections.map((s) => {
              const cls = [
                styles.sectionItem,
                s.isActive ? styles.sectionItemActive : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={s.href}
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => handleSectionPick(s.href)}
                >
                  <span>{s.label}</span>
                  {s.isActive && (
                    <span className={styles.sectionItemDot} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </span>

      <div className={styles.spacer} />

      {/* Save state */}
      <SavePill state={saveState} secondsAgo={saveSecondsAgo} />

      {/* Right cluster */}
      <div className={styles.rightCluster}>
        {onSearch !== undefined && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onSearch}
            aria-label="Cerca ⌘K"
            title="Cerca (⌘K)"
          >
            <Icon name="search" size={16} aria-hidden={true} />
          </button>
        )}

        {onBell !== undefined && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onBell}
            aria-label={
              notificationCount > 0
                ? `Notifiche — ${notificationCount} nuove`
                : "Notifiche"
            }
            title="Notifiche"
          >
            <Icon name="bell" size={16} aria-hidden={true} />
            {notificationCount > 0 && (
              <span className={styles.bellBadge} aria-hidden="true" />
            )}
          </button>
        )}

        {onAskCesare !== undefined && (
          <button
            type="button"
            className={styles.askBtn}
            onClick={onAskCesare}
            aria-label="Chiedi a Cesare (⌘.)"
            title="Chiedi a Cesare (⌘.)"
          >
            Chiedi a Cesare
            <span className={styles.askHotkey} aria-hidden="true">
              ⌘.
            </span>
          </button>
        )}

        {presenceUsers.length > 0 && (
          <Presence users={presenceUsers} maxVisible={3} />
        )}

        {onAvatarClick !== undefined ? (
          <button
            type="button"
            className={styles.avatarBtn}
            onClick={onAvatarClick}
            aria-label={`Account utente (${userInitials})`}
            title="Account"
          >
            {userInitials}
          </button>
        ) : (
          <span
            className={styles.avatarBtn}
            aria-label={`Account utente (${userInitials})`}
            title="Account"
          >
            {userInitials}
          </span>
        )}
      </div>
    </header>
  );
}
