import { Avatar } from "@oh-writers/ui";
import type { CollaboratorEntry } from "../../server/project-overview.server";
import type { Peer } from "~/features/realtime";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./TeamPresence.module.css";

interface TeamPresenceProps {
  readonly collaborators: CollaboratorEntry[];
  // Presence overlay (Spec 09b §A2). Optional so the static list keeps working
  // when realtime is disabled or no live room exists.
  readonly peers?: Peer[];
  readonly localUserId?: string | null;
  // True only when the live room is actually connected; gates the "N online"
  // count and the local-user online ring.
  readonly isOnline?: boolean;
}

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  owner: "projects.team.roleOwner",
  editor: "projects.team.roleEditor",
  viewer: "projects.team.roleViewer",
  ai: "projects.team.roleAi",
};

/**
 * Builds the set of collaborator ids currently online. A collaborator is online
 * when a peer reports their `userId`, or when they are the local user and the
 * room is connected.
 */
export const onlineCollaboratorIds = (
  peers: Peer[],
  localUserId: string | null,
  isOnline: boolean,
): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const peer of peers) {
    if (peer.userId) ids.add(peer.userId);
  }
  if (isOnline && localUserId) ids.add(localUserId);
  return ids;
};

export function TeamPresence({
  collaborators,
  peers = [],
  localUserId = null,
  isOnline = false,
}: TeamPresenceProps) {
  const { t } = useTranslation();
  const onlineIds = onlineCollaboratorIds(peers, localUserId, isOnline);
  const onlineCount = collaborators.reduce(
    (acc, c) => (onlineIds.has(c.id) ? acc + 1 : acc),
    0,
  );

  return (
    <section className={styles.section} aria-labelledby="overview-team-h">
      <div className={styles.head}>
        <h2 id="overview-team-h" className={styles.title}>
          {t("projects.team.heading")}
        </h2>
        {onlineCount > 0 && (
          <span className={styles.onlineCount} data-testid="team-online-count">
            {t("projects.team.onlineCount").replace(
              "{count}",
              String(onlineCount),
            )}
          </span>
        )}
      </div>
      <ul className={styles.list}>
        {collaborators.map((c) => {
          const roleKey = ROLE_LABEL_KEYS[c.role];
          const online = onlineIds.has(c.id);
          return (
            <li key={c.id} className={styles.row}>
              <span className={styles.avatarWrap}>
                <Avatar name={c.avatarSeed} size="sm" />
                {online && (
                  <span
                    className={styles.onlineDot}
                    data-testid="collaborator-online-dot"
                    title={t("projects.team.online")}
                    aria-label={t("projects.team.online")}
                  />
                )}
              </span>
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
