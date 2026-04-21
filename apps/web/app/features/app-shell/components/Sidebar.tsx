import { Link, useMatches } from "@tanstack/react-router";
import {
  FolderOpen,
  LayoutDashboard,
  PenLine,
  FileText,
  BookOpen,
  ListTree,
  ScrollText,
  Settings,
  Layers,
  Calendar,
  Euro,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";
import type { AppUser } from "~/server/context";
import { signOut } from "~/lib/auth-client";
import styles from "./Sidebar.module.css";

const ICON_SIZE = 18;
const ICON_STROKE = 1.5;

interface SidebarProps {
  user: AppUser;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ user, isCollapsed, onToggle }: SidebarProps) {
  const matches = useMatches();

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const projectMatch = matches.find((m) => m.routeId.includes("/projects/$id"));
  const projectId = (projectMatch?.params as { id?: string } | undefined)?.id;

  return (
    <aside className={styles.sidebar} data-collapsed={isCollapsed || undefined}>
      {/* Logo + collapse toggle */}
      <div className={styles.logoRow}>
        <Link to="/dashboard" className={styles.logo} title="Oh Writers">
          oh{!isCollapsed && <span className={styles.logoAccent}>writers</span>}
        </Link>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onToggle}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={16} strokeWidth={ICON_STROKE} />
          ) : (
            <PanelLeftClose size={16} strokeWidth={ICON_STROKE} />
          )}
        </button>
      </div>

      <nav className={styles.nav} aria-label="Global navigation">
        {/* Project navigation — visible when inside a project */}
        {projectId ? (
          <>
            {/* Overview */}
            <div className={styles.navSection}>
              {!isCollapsed && (
                <div className={styles.sectionLabel}>Project</div>
              )}
              <Link
                to="/projects/$id"
                params={{ id: projectId }}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                activeOptions={{ exact: true }}
                title="Overview"
              >
                <LayoutDashboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Overview</span>
                )}
              </Link>
            </div>

            {/* Writing — all document types */}
            <div className={styles.navSection}>
              {!isCollapsed && (
                <div className={styles.sectionLabel}>Writing</div>
              )}
              <Link
                to={`/projects/${projectId}/logline` as string}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                title="Logline"
              >
                <PenLine size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Logline</span>
                )}
              </Link>
              <Link
                to={`/projects/${projectId}/synopsis` as string}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                title="Synopsis"
              >
                <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Synopsis</span>
                )}
              </Link>
              <Link
                to={`/projects/${projectId}/outline` as string}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                title="Outline"
              >
                <ListTree size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Outline</span>
                )}
              </Link>
              <Link
                to={`/projects/${projectId}/treatment` as string}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                title="Treatment"
              >
                <ScrollText size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Treatment</span>
                )}
              </Link>
              <Link
                to="/projects/$id/screenplay"
                params={{ id: projectId }}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                title="Screenplay"
              >
                <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Screenplay</span>
                )}
              </Link>
            </div>

            {/* Production — future tabs */}
            <div className={styles.navSection}>
              {!isCollapsed && (
                <div className={styles.sectionLabel}>Production</div>
              )}
              <Link
                to="/projects/$id/breakdown"
                params={{ id: projectId }}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                title="Breakdown"
              >
                <Layers size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Breakdown</span>
                )}
              </Link>
              <span
                className={`${styles.navLink} ${styles.disabled}`}
                title="Schedule (coming soon)"
              >
                <Calendar size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <>
                    <span className={styles.navLabel}>Schedule</span>
                    <span className={styles.soon}>soon</span>
                  </>
                )}
              </span>
              <span
                className={`${styles.navLink} ${styles.disabled}`}
                title="Budget (coming soon)"
              >
                <Euro size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <>
                    <span className={styles.navLabel}>Budget</span>
                    <span className={styles.soon}>soon</span>
                  </>
                )}
              </span>
              <span
                className={`${styles.navLink} ${styles.disabled}`}
                title="Locations (coming soon)"
              >
                <MapPin size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <>
                    <span className={styles.navLabel}>Locations</span>
                    <span className={styles.soon}>soon</span>
                  </>
                )}
              </span>
            </div>

            {/* Settings */}
            <div className={styles.navSection}>
              <Link
                to="/projects/$id/settings"
                params={{ id: projectId }}
                className={styles.navLink}
                activeProps={{
                  className: `${styles.navLink} ${styles.active}`,
                }}
                title="Settings"
              >
                <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {!isCollapsed && (
                  <span className={styles.navLabel}>Settings</span>
                )}
              </Link>
            </div>
          </>
        ) : (
          /* Dashboard view — no project selected */
          <div className={styles.navSection}>
            <Link
              to="/dashboard"
              className={styles.navLink}
              activeProps={{ className: `${styles.navLink} ${styles.active}` }}
              title="Projects"
            >
              <FolderOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              {!isCollapsed && (
                <span className={styles.navLabel}>Projects</span>
              )}
            </Link>
          </div>
        )}
      </nav>

      {/* User */}
      <div className={styles.user}>
        <div className={styles.userAvatar} title={user.name}>
          {initials}
        </div>
        {!isCollapsed && (
          <>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut size={16} strokeWidth={ICON_STROKE} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
