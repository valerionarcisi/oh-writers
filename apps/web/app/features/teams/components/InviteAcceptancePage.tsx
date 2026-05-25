import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { match } from "ts-pattern";
import { unwrapResult } from "@oh-writers/utils";
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
        () => "Invito non trovato o non valido.",
      )
      .with({ _tag: "TeamNotFoundError" }, () => "Il team non esiste più.")
      .otherwise(() => "Errore nel caricamento dell'invito.");

    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Invito non valido</h1>
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
        <h1 className={styles.title}>Unisciti a {team.name}</h1>

        {isExpired ? (
          <p className={styles.description}>
            Questo invito è scaduto. Chiedi all'amministratore di inviarne uno
            nuovo.
          </p>
        ) : isAccepted ? (
          <p className={styles.description}>
            Hai già accettato questo invito.{" "}
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
              Vai al team
            </button>
          </p>
        ) : (
          <>
            <p className={styles.description}>
              Sei stato invitato a far parte di <strong>{team.name}</strong>{" "}
              come <strong>{invitation.role}</strong>.
            </p>

            {acceptMutation.isError && (
              <p className={styles.errorMsg}>
                {(acceptMutation.error as { message?: string }).message ??
                  "Errore durante l'accettazione dell'invito."}
              </p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.acceptBtn}
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? "Accettazione…" : "Accetta invito"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
