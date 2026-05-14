// packages/ui/src/primitives/Presence/Presence.tsx
import styles from "./Presence.module.css";

export type PresenceUser = {
  id: string;
  name: string;
  initials: string;
  avatarUrl?: string;
};

export type PresenceProps = {
  users: PresenceUser[];
  maxVisible?: number;
};

export function Presence({ users, maxVisible = 4 }: PresenceProps) {
  if (users.length === 0) return null;

  const visible = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;
  const allNames = users.map((u) => u.name).join(", ");

  return (
    <ul
      className={styles.list}
      aria-label={`Collaboratori presenti: ${allNames}`}
    >
      {overflow > 0 && (
        <li className={styles.item}>
          <span
            className={[styles.avatar, styles.overflow].join(" ")}
            aria-label={`${overflow} altri collaboratori`}
            title={users.slice(maxVisible).map((u) => u.name).join(", ")}
          >
            +{overflow}
          </span>
        </li>
      )}
      {[...visible].reverse().map((user) => (
        <li key={user.id} className={styles.item}>
          <span
            className={styles.avatar}
            title={user.name}
            aria-label={user.name}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className={styles.img}
              />
            ) : (
              user.initials
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
