import { Link, useRouter } from "@tanstack/react-router";
import type { AppUser } from "~/server/context";
import { signOut } from "~/lib/auth-client";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  user: AppUser;
}

export function Sidebar({ user }: SidebarProps) {
  const router = useRouter();

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    router.navigate({ to: "/login" });
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoText}>Oh Writers</span>
      </div>

      <nav className={styles.nav}>
        <Link
          to="/dashboard"
          className={styles.navLink}
          activeProps={{ className: `${styles.navLink} ${styles.active}` }}
        >
          Dashboard
        </Link>
        <Link
          to="/projects/new"
          className={styles.navLink}
          activeProps={{ className: `${styles.navLink} ${styles.active}` }}
        >
          + New Project
        </Link>
      </nav>

      <div className={styles.user}>
        <div className={styles.userAvatar}>{initials}</div>
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
          ↩
        </button>
      </div>
    </aside>
  );
}
