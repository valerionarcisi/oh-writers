import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { match } from "ts-pattern";
import { Users, Settings, Plus } from "lucide-react";
import { useTranslation } from "~/features/i18n";
import { teamQueryOptions } from "../server/teams.server";
import styles from "./TeamDashboardPage.module.css";

interface TeamDashboardPageProps {
  slug: string;
}

export function TeamDashboardPage({ slug }: TeamDashboardPageProps) {
  const { t } = useTranslation();
  const { data: result } = useSuspenseQuery(teamQueryOptions(slug));

  if (!result.isOk) {
    return (
      <div className={styles.error}>
        {match(result.error)
          .with({ _tag: "TeamNotFoundError" }, () => t("teams.error.notFound"))
          .with({ _tag: "ForbiddenError" }, () => t("teams.error.forbidden"))
          .otherwise(() => t("teams.error.loadTeam"))}
      </div>
    );
  }

  const { members, invitations, ...team } = result.value;
  const currentUserRole = members.find(() => true)?.role ?? null; // shown for display; actual gating done server-side

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.teamInfo}>
          <div className={styles.avatar}>
            {team.avatarUrl ? (
              <img
                src={team.avatarUrl}
                alt={team.name}
                className={styles.avatarImg}
              />
            ) : (
              <span className={styles.avatarInitials}>
                {team.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className={styles.teamName}>{team.name}</h1>
            <p className={styles.teamSlug}>@{team.slug}</p>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Link
            to="/teams/$slug/members"
            params={{ slug }}
            className={styles.actionBtn}
          >
            <Users size={16} strokeWidth={1.5} />
            {t("teams.dashboard.members")}
          </Link>
          <Link
            to="/teams/$slug/settings"
            params={{ slug }}
            className={styles.actionBtn}
          >
            <Settings size={16} strokeWidth={1.5} />
            {t("teams.dashboard.settings")}
          </Link>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            {t("teams.dashboard.projectsTitle")}
          </h2>
          <Link to="/dashboard" className={styles.newProjectBtn}>
            <Plus size={14} strokeWidth={1.5} />
            {t("teams.dashboard.newProject")}
          </Link>
        </div>
        <p className={styles.emptyHint}>{t("teams.dashboard.projectsHint")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("teams.dashboard.membersTitle")} ({members.length})
        </h2>
        <ul className={styles.memberList}>
          {members.map((member) => (
            <li key={member.id} className={styles.memberRow}>
              <div className={styles.memberAvatar}>
                {(member.userName ?? member.userEmail)
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className={styles.memberDetails}>
                <span className={styles.memberId}>
                  {member.userName ?? member.userEmail}
                </span>
                <span className={styles.memberRole}>{member.role}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {invitations.filter((i) => !i.acceptedAt).length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t("teams.dashboard.pendingTitle")} (
            {invitations.filter((i) => !i.acceptedAt).length})
          </h2>
          <ul className={styles.memberList}>
            {invitations
              .filter((i) => !i.acceptedAt)
              .map((inv) => (
                <li key={inv.id} className={styles.memberRow}>
                  <div className={`${styles.memberAvatar} ${styles.pending}`}>
                    {inv.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={styles.memberDetails}>
                    <span className={styles.memberId}>{inv.email}</span>
                    <span className={styles.memberRole}>{inv.role}</span>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
