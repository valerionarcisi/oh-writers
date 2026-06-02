import { Avatar } from "@oh-writers/ui";
import type { CollaboratorEntry } from "../../server/project-overview.server";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./TeamPresence.module.css";

interface TeamPresenceProps {
  readonly collaborators: CollaboratorEntry[];
}

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  owner: "projects.team.roleOwner",
  editor: "projects.team.roleEditor",
  viewer: "projects.team.roleViewer",
  ai: "projects.team.roleAi",
};

export function TeamPresence({ collaborators }: TeamPresenceProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.section} aria-labelledby="overview-team-h">
      <div className={styles.head}>
        <h2 id="overview-team-h" className={styles.title}>
          {t("projects.team.heading")}
        </h2>
      </div>
      <ul className={styles.list}>
        {collaborators.map((c) => {
          const roleKey = ROLE_LABEL_KEYS[c.role];
          return (
            <li key={c.id} className={styles.row}>
              <Avatar name={c.avatarSeed} size="sm" />
              <div className={styles.info}>
                <div className={styles.name}>{c.name}</div>
                <div className={styles.role}>
                  {roleKey ? t(roleKey) : c.role}
                </div>
              </div>
            </li>
          );
        })}
        <li className={styles.row}>
          <span className={styles.invitePlus} aria-hidden>
            +
          </span>
          <div className={styles.info}>
            <div className={styles.nameMuted}>{t("projects.team.invite")}</div>
            <div className={styles.role}>{t("projects.team.inviteRole")}</div>
          </div>
        </li>
      </ul>
    </section>
  );
}
