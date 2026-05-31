import { Avatar } from "@oh-writers/ui";
import type { CollaboratorEntry } from "../../server/project-overview.server";
import styles from "./TeamPresence.module.css";

interface TeamPresenceProps {
  readonly collaborators: CollaboratorEntry[];
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Autore · Proprietario",
  editor: "Editor",
  viewer: "Lettore",
  ai: "Assistente AI",
};

export function TeamPresence({ collaborators }: TeamPresenceProps) {
  return (
    <section className={styles.section} aria-labelledby="overview-team-h">
      <div className={styles.head}>
        <h2 id="overview-team-h" className={styles.title}>
          Persone
        </h2>
      </div>
      <ul className={styles.list}>
        {collaborators.map((c) => (
          <li key={c.id} className={styles.row}>
            <Avatar name={c.avatarSeed} size="sm" />
            <div className={styles.info}>
              <div className={styles.name}>{c.name}</div>
              <div className={styles.role}>{ROLE_LABEL[c.role] ?? c.role}</div>
            </div>
          </li>
        ))}
        <li className={styles.row}>
          <span className={styles.invitePlus} aria-hidden>
            +
          </span>
          <div className={styles.info}>
            <div className={styles.nameMuted}>Invita collaboratore</div>
            <div className={styles.role}>Lettore o editor</div>
          </div>
        </li>
      </ul>
    </section>
  );
}
