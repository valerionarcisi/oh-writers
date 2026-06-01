import type { Peer, RealtimeStatus } from "../hooks/useYjsRoom";
import styles from "./PresenceIndicator.module.css";

interface PresenceIndicatorProps {
  status: RealtimeStatus;
  peers: Peer[];
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/**
 * Shows who else is live in the document: a colored avatar per remote peer plus
 * an "N persone online" count. Renders an "offline" hint when the provider is
 * set but disconnected. Nothing renders when realtime is disabled.
 */
export function PresenceIndicator({ status, peers }: PresenceIndicatorProps) {
  if (status === "disabled") return null;

  if (status === "offline") {
    return (
      <span className={styles.offline} title="Connessione in tempo reale assente">
        offline
      </span>
    );
  }

  const online = peers.length + 1;
  const label = online === 1 ? "1 persona online" : `${online} persone online`;

  return (
    <div className={styles.root} aria-label={label}>
      <div className={styles.avatars}>
        {peers.slice(0, 4).map((peer) => (
          <span
            key={peer.clientId}
            className={styles.avatar}
            style={{ backgroundColor: peer.color }}
            title={peer.name}
          >
            {initials(peer.name)}
          </span>
        ))}
      </div>
      <span className={styles.count} data-testid="presence-count">
        {online} online
      </span>
    </div>
  );
}
