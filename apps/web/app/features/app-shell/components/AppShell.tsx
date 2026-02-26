import type { ReactNode } from "react";
import type { AppUser } from "~/server/context";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  user: AppUser;
  children: ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar user={user} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
