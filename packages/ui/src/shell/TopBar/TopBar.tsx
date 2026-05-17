// packages/ui/src/shell/TopBar/TopBar.tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons/Icon";
import type { IconName } from "../../icons/icon-names";
import { SavePill } from "../../primitives/SavePill/SavePill";
import type { SaveState } from "../../primitives/SavePill/SavePill";
import { Presence } from "../../primitives/Presence/Presence";
import type { PresenceUser } from "../../primitives/Presence/Presence";
import { ProjectSwitcherPopover } from "./ProjectSwitcherPopover";
import type { ProjectSwitcherItem } from "./ProjectSwitcherPopover";
import { DropdownMenu } from "../../components/DropdownMenu";
import type { DropdownMenuItem } from "../../components/DropdownMenu";
import styles from "./TopBar.module.css";

function SectionMenuItem({
  section,
  onPick,
}: {
  section: TopBarSection;
  onPick: (href: string) => void;
}) {
  const cls = [styles.sectionItem, section.isActive ? styles.sectionItemActive : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      role="menuitem"
      className={cls}
      onClick={() => onPick(section.href)}
    >
      {section.icon && (
        <Icon
          name={section.icon as IconName}
          size={14}
          aria-hidden={true}
        />
      )}
      <span>{section.label}</span>
      {section.isActive && (
        <span className={styles.sectionItemDot} aria-hidden="true" />
      )}
    </button>
  );
}

export type TopBarSection = {
  label: string;
  href: string;
  isActive?: boolean;
  /** Optional Icon name (from the DS icon sprite). When provided, renders a
   *  small leading icon — matches the f-ambient mockup section dropdown. */
  icon?: string;
};

export type TopBarSectionGroup = {
  label: string;
  items: ReadonlyArray<TopBarSection>;
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
  /** Grouped variant of `sections` — when provided, the popover renders
   *  group labels and dividers between them (e.g. Scrittura / Pre-produzione
   *  / Produzione). Takes precedence over `sections`. */
  sectionGroups?: ReadonlyArray<TopBarSectionGroup>;
  /** When provided, clicking the project breadcrumb opens a popover listing
   *  these projects. If omitted, the button falls back to onProjectClick. */
  projects?: ReadonlyArray<ProjectSwitcherItem>;
  currentProjectId?: string;
  onProjectSelect?: (id: string) => void;
  onAllProjects?: () => void;
  onNavigate?: (href: string) => void;
  onBrandClick?: () => void;
  onProjectClick?: () => void;
  onSectionClick?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
  onAskCesare?: () => void;
  onAvatarClick?: () => void;
  /** When provided, clicking the avatar opens a DropdownMenu with these items
   *  (sign out, settings, etc.). Takes precedence over onAvatarClick. */
  userMenuItems?: DropdownMenuItem[];
};

export function TopBar({
  projectName,
  sectionName,
  isScrolled = false,
  saveState,
  saveSecondsAgo,
  cesareNoteCount = 0,
  presenceUsers = [],
  notificationCount = 0,
  userInitials,
  sections,
  sectionGroups,
  projects,
  currentProjectId,
  onProjectSelect,
  onAllProjects,
  onNavigate,
  onBrandClick,
  onProjectClick,
  onSectionClick,
  onSearch,
  onBell,
  onAskCesare,
  onAvatarClick,
  userMenuItems,
}: TopBarProps) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const sectionWrapRef = useRef<HTMLSpanElement>(null);
  const projectWrapRef = useRef<HTMLSpanElement>(null);
  const hasGroupedMenu =
    sectionGroups !== undefined && sectionGroups.length > 0;
  const hasFlatMenu = sections !== undefined && sections.length > 0;
  const hasSectionMenu = hasGroupedMenu || hasFlatMenu;
  const hasProjectMenu = projects !== undefined;

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

  useEffect(() => {
    if (!projectsOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (
        projectWrapRef.current &&
        !projectWrapRef.current.contains(e.target as Node)
      ) {
        setProjectsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [projectsOpen]);

  const handleProjectTriggerClick = () => {
    if (hasProjectMenu) {
      setProjectsOpen((v) => !v);
      return;
    }
    onProjectClick?.();
  };

  const handleProjectPick = (id: string) => {
    setProjectsOpen(false);
    onProjectSelect?.(id);
  };

  const handleAllProjects = () => {
    setProjectsOpen(false);
    onAllProjects?.();
  };

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
      <span className={styles.projectWrap} ref={projectWrapRef}>
        <button
          type="button"
          className={styles.breadcrumbBtn}
          onClick={handleProjectTriggerClick}
          aria-label={`Progetto: ${projectName} — cambia progetto`}
          aria-haspopup={hasProjectMenu ? "listbox" : undefined}
          aria-expanded={hasProjectMenu ? projectsOpen : undefined}
          data-testid="topbar-project-trigger"
        >
          <span className={styles.projectName}>{projectName}</span>
          <Icon name="chevron-down" size={12} aria-hidden={true} />
        </button>
        {hasProjectMenu && projectsOpen && (
          <ProjectSwitcherPopover
            projects={projects!}
            currentProjectId={currentProjectId}
            onSelect={handleProjectPick}
            onAllProjects={handleAllProjects}
            onClose={() => setProjectsOpen(false)}
          />
        )}
      </span>

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
            {hasGroupedMenu
              ? sectionGroups!.map((group, gIdx) => {
                  const labelId = `section-group-${gIdx}`;
                  return (
                    <div
                      key={group.label}
                      className={styles.sectionGroup}
                      role="group"
                      aria-labelledby={labelId}
                    >
                      {gIdx > 0 && (
                        <span
                          className={styles.sectionDivider}
                          aria-hidden="true"
                        />
                      )}
                      <header
                        id={labelId}
                        className={styles.sectionGroupLabel}
                      >
                        {group.label}
                      </header>
                      {group.items.map((s) => (
                        <SectionMenuItem
                          key={s.href}
                          section={s}
                          onPick={handleSectionPick}
                        />
                      ))}
                    </div>
                  );
                })
              : sections!.map((s) => (
                  <SectionMenuItem
                    key={s.href}
                    section={s}
                    onPick={handleSectionPick}
                  />
                ))}
          </div>
        )}
      </span>

      <div className={styles.spacer} />

      {/* Save state — hidden on read-only pages (dashboard, project home) */}
      {saveState !== undefined && (
        <SavePill state={saveState} secondsAgo={saveSecondsAgo} />
      )}

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

        {userMenuItems !== undefined ? (
          <DropdownMenu
            trigger={
              <span
                className={styles.avatarBtn}
                aria-label={`Account utente (${userInitials})`}
                title="Account"
              >
                {userInitials}
              </span>
            }
            items={userMenuItems}
            align="end"
          />
        ) : onAvatarClick !== undefined ? (
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
