import { type ReactNode, useState, useCallback } from "react";
import type { AppUser } from "~/server/context";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import styles from "./AppShell.module.css";

interface AppShellProps {
  user: AppUser;
  children: ReactNode;
}

const STORAGE_KEY = "ohw-sidebar-collapsed";

const getInitialCollapsed = (): boolean => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
};

export function AppShell({ user, children }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsed);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <VersionsDrawerProvider>
      <div className={styles.shell} data-collapsed={isCollapsed || undefined}>
        <Sidebar
          user={user}
          isCollapsed={isCollapsed}
          onToggle={toggleSidebar}
        />
        <div className={styles.content}>
          <TopBar />
          <main className={styles.main}>{children}</main>
        </div>
        <VersionsDrawer />
      </div>
    </VersionsDrawerProvider>
  );
}
