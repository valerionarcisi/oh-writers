import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { match } from "ts-pattern";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import {
  inviteByTokenQueryOptions,
  acceptInvite,
} from "../server/teams.server";
import styles from "./InviteAcceptancePage.module.css";

interface InviteAcceptancePageProps {
  token: string;
}

export function InviteAcceptancePage({ token }: InviteAcceptancePageProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: result } = useSuspenseQuery(inviteByTokenQueryOptions(token));

  const acceptMutation = useMutation({
    mutationFn: async () =>
      unwrapResult(await acceptInvite({ data: { token } })),
    onSuccess: (_member) => {
      if (result.isOk) {
        void navigate({
          to: "/teams/$slug",
          params: { slug: result.value.team.slug },
        });
      } else {
        void navigate({ to: "/dashboard" });
      }
    },
  });

  if (!result.isOk) {
    const errorMsg = match(result.error)
      .with(
        { _tag: "InvitationNotFoundError" },
        () => t("teams.invite.notFound"),
      )
      .with({ _tag: "TeamNotFoundError" }, () => t("teams.invite.teamGone"))
      .otherwise(() => t("teams.invite.loadError"));

    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t("teams.invite.invalidTitle")}</h1>
          <p className={styles.description}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  const { invitation, team } = result.value;
  const isExpired = invitation.expiresAt < new Date();
  const isAccepted = Boolean(invitation.acceptedAt);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          {t("teams.invite.joinTitle")} {team.name}
        </h1>

        {isExpired ? (
          <p className={styles.description}>{t("teams.invite.expired")}</p>
        ) : isAccepted ? (
          <p className={styles.description}>
            {t("teams.invite.alreadyAccepted")}{" "}
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() =>
                void navigate({
                  to: "/teams/$slug",
                  params: { slug: team.slug },
                })
              }
            >
              {t("teams.invite.goToTeam")}
            </button>
          </p>
        ) : (
          <>
            <p className={styles.description}>
              {t("teams.invite.invitedAs1")} <strong>{team.name}</strong>{" "}
              {t("teams.invite.invitedAs2")} <strong>{invitation.role}</strong>.
            </p>

            {acceptMutation.isError && (
              <p className={styles.errorMsg}>
                {(acceptMutation.error as { message?: string }).message ??
                  t("teams.invite.acceptError")}
              </p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.acceptBtn}
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending
                  ? t("teams.invite.accepting")
                  : t("teams.invite.accept")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
