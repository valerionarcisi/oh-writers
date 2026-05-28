// packages/ui/src/shell/TopBar/TopBar.tsx
//
// Slim per-page top strip. Project identity and section navigation live in
// the LeftRail now — this header is just the per-page breadcrumb + the
// slots a page might want to surface (scope chip, version selector, save
// state, search). On Sceneggiatura the optional `elementLegend` slot adds
// a second row right under the main one (Fountain element legend).
//
// Existing callers (dev/tokens.tsx, legacy AppShell wiring) pass props like
// `projects`, `sectionGroups`, `onBell`, `onAvatarClick` etc. — those are
// kept in the type for backwards compatibility but no longer render UI.
// The shell refactor moves those affordances into the LeftRail and
// BottomDock.

import type { ReactNode } from "react";
import type { SaveState } from "../../primitives/SavePill/SavePill";
import { Icon } from "../../icons/Icon";
import type { ProjectSwitcherItem } from "./ProjectSwitcherPopover";
import type { DropdownMenuItem } from "../../components/DropdownMenu";
import type { PresenceUser } from "../../primitives/Presence/Presence";
import styles from "./TopBar.module.css";

// ─── Public types ──────────────────────────────────────────────
// We keep the section types exported so consumers like _app.tsx can phase
// out their use without a hard cut-over. The new `LeftRail` owns the data.
export type TopBarSection = {
  label: string;
  href: string;
  isActive?: boolean;
  icon?: string;
};

export type TopBarSectionGroup = {
  label: string;
  items: ReadonlyArray<TopBarSection>;
};

export type TopBarProps = {
  /** Section / page name shown as the breadcrumb crumb (the rail handles
   *  navigation; this is purely an in-context label). */
  sectionName: string;

  /** Whether the page has scrolled past 0 — controls border-bottom appearance. */
  isScrolled?: boolean;

  /** Optional inline scope chip (e.g. `SOTTOLINEA · 3` on Breakdown). */
  scopeChip?: ReactNode;

  /** Version selector slot — typically a `VersionTrigger` from the feature. */
  versionSelector?: ReactNode;

  /** Save state slot — typically a `SavePill` configured by the page. */
  saveStateSlot?: ReactNode;

  /** When provided, render a second row under the main top-strip. The
   *  Sceneggiatura page surfaces the Fountain Element Legend here. */
  elementLegend?: ReactNode;

  /** Click handler for the search button (Command palette trigger). */
  onSearch?: () => void;

  // ── Compatibility-only props (no longer rendered) ─────────────
  // The shell refactor moves these into LeftRail (project, sections) and
  // BottomDock (bell, avatar, settings). We still accept them so callers
  // can phase out without a build break.
  /** @deprecated Project switching lives in the LeftRail. */
  projectName?: string;
  /** @deprecated Section navigation lives in the LeftRail. */
  sections?: ReadonlyArray<TopBarSection>;
  /** @deprecated Section navigation lives in the LeftRail. */
  sectionGroups?: ReadonlyArray<TopBarSectionGroup>;
  /** @deprecated Project switching lives in the LeftRail. */
  projects?: ReadonlyArray<ProjectSwitcherItem>;
  /** @deprecated Project switching lives in the LeftRail. */
  currentProjectId?: string;
  /** @deprecated Project switching lives in the LeftRail. */
  onProjectSelect?: (id: string) => void;
  /** @deprecated Project switching lives in the LeftRail. */
  onAllProjects?: () => void;
  /** @deprecated Section navigation lives in the LeftRail. */
  onNavigate?: (href: string) => void;
  /** @deprecated Identity lives in the LeftRail. */
  onBrandClick?: () => void;
  /** @deprecated Identity lives in the LeftRail. */
  onProjectClick?: () => void;
  /** @deprecated Section navigation lives in the LeftRail. */
  onSectionClick?: () => void;
  /** @deprecated Notifications live in the BottomDock. */
  onBell?: () => void;
  /** @deprecated Cesare entry lives in the BottomDock. */
  onAskCesare?: () => void;
  /** @deprecated User menu lives in the BottomDock. */
  onAvatarClick?: () => void;
  /** @deprecated User menu lives in the BottomDock. */
  userMenuItems?: DropdownMenuItem[];
  /** @deprecated Avatar lives in the BottomDock. */
  userInitials?: string;
  /** @deprecated Notification count surfaces on the BottomDock bell. */
  notificationCount?: number;
  /** @deprecated Save state moved to the `saveStateSlot` slot. */
  saveState?: SaveState;
  /** @deprecated Save state moved to the `saveStateSlot` slot. */
  saveSecondsAgo?: number;
  /** @deprecated Cesare badging lives on the BottomDock pill. */
  cesareNoteCount?: number;
  /** @deprecated Cesare badging lives on the BottomDock pill. */
  cesareHasUnseen?: boolean;
  /** @deprecated Presence surfaces in the active page header now. */
  presenceUsers?: PresenceUser[];
};

export function TopBar({
  sectionName,
  isScrolled = false,
  scopeChip,
  versionSelector,
  saveStateSlot,
  elementLegend,
  onSearch,
}: TopBarProps) {
  return (
    <header
      className={[styles.wrap, isScrolled ? styles.isScrolled : ""]
        .filter(Boolean)
        .join(" ")}
      data-testid="topstrip"
    >
      <div className={styles.row}>
        <div className={styles.left}>
          <span className={styles.crumb}>{sectionName}</span>
          {scopeChip && <span className={styles.scope}>{scopeChip}</span>}
        </div>

        <div className={styles.right}>
          {onSearch && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onSearch}
              aria-label="Cerca ⌘K"
              title="Cerca (⌘K)"
            >
              <Icon name="search" size={14} aria-hidden={true} />
            </button>
          )}
          {saveStateSlot && (
            <span className={styles.saveState}>{saveStateSlot}</span>
          )}
          {versionSelector && (
            <span className={styles.versionSlot}>{versionSelector}</span>
          )}
        </div>
      </div>

      {elementLegend && (
        <div className={styles.legendRow} data-testid="topstrip-legend">
          {elementLegend}
        </div>
      )}
    </header>
  );
}
