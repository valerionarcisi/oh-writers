import { Link, useRouter } from "@tanstack/react-router";
import type { AppUser } from "~/server/context";
import { signOut } from "~/lib/auth-client";
import styles from "./TopNav.module.css";

interface TopNavProps {
  user: AppUser;
}

export function TopNav({ user }: TopNavProps) {
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
    <nav className={styles.topNav} aria-label="Global navigation">
      <Link to="/dashboard" className={styles.logo}>
        oh<span className={styles.logoAccent}>writers</span>
      </Link>

      <div className={styles.divider} />

      <Link
        to="/dashboard"
        className={styles.navLink}
        activeProps={{ className: `${styles.navLink} ${styles.active}` }}
      >
        Projects
      </Link>

      <div className={styles.spacer} />

      <Link to="/projects/new" className={styles.newBtn}>
        + New project
      </Link>

      <button
        type="button"
        className={styles.avatar}
        onClick={handleSignOut}
        title={`Sign out (${user.email})`}
      >
        {initials}
      </button>
    </nav>
  );
}
