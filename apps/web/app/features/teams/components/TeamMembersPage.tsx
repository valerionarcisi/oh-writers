import { useState } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { match } from "ts-pattern";
import { unwrapResult } from "@oh-writers/utils";
import { UserMinus, RotateCcw, X } from "lucide-react";
import {
  teamQueryOptions,
  inviteMember,
  resendInvite,
  revokeInvite,
  removeMember,
  updateMemberRole,
} from "../server/teams.server";
import styles from "./TeamMembersPage.module.css";

interface TeamMembersPageProps {
  slug: string;
  currentUserId: string;
}

type RoleOption = "owner" | "editor" | "viewer";

export function TeamMembersPage({ slug, currentUserId }: TeamMembersPageProps) {
  const qc = useQueryClient();
  const { data: result } = useSuspenseQuery(teamQueryOptions(slug));

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleOption>("editor");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!result.isOk) {
    return (
      <div className={styles.error}>
        {match(result.error)
          .with({ _tag: "TeamNotFoundError" }, () => "Team non trovato.")
          .with({ _tag: "ForbiddenError" }, () => "Accesso negato.")
          .otherwise(() => "Errore nel caricamento del team.")}
      </div>
    );
  }

  const team = result.value;
  const membership = team.members.find((m) => m.userId === currentUserId);
  const isOwner = membership?.role === "owner";

  if (!isOwner) {
    return (
      <div className={styles.forbidden}>
        Solo i proprietari possono gestire i membri.
      </div>
    );
  }

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["teams", slug] });

  const inviteMutation = useMutation({
    mutationFn: async () =>
      unwrapResult(
        await inviteMember({
          data: { teamId: team.id, email: inviteEmail, role: inviteRole },
        }),
      ),
    onSuccess: () => {
      setInviteEmail("");
      setInviteError(null);
      invalidate();
    },
    onError: (e: { message?: string }) => {
      setInviteError(e.message ?? "Errore durante l'invio dell'invito.");
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (invitationId: string) =>
      unwrapResult(await resendInvite({ data: { invitationId } })),
    onSuccess: invalidate,
    onError: (e: { message?: string }) => {
      setActionError(e.message ?? "Errore.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (invitationId: string) =>
      unwrapResult(await revokeInvite({ data: { invitationId } })),
    onSuccess: invalidate,
    onError: (e: { message?: string }) => {
      setActionError(e.message ?? "Errore.");
    },
  });

  const removeMemMutation = useMutation({
    mutationFn: async (userId: string) =>
      unwrapResult(await removeMember({ data: { teamId: team.id, userId } })),
    onSuccess: invalidate,
    onError: (e: { message?: string }) => {
      setActionError(e.message ?? "Errore.");
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: RoleOption;
    }) =>
      unwrapResult(
        await updateMemberRole({ data: { teamId: team.id, userId, role } }),
      ),
    onSuccess: invalidate,
    onError: (e: { message?: string }) => {
      setActionError(e.message ?? "Errore.");
    },
  });

  const pendingInvitations = team.invitations.filter((i) => !i.acceptedAt);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Membri — {team.name}</h1>

      {/* Invite form */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invita membro</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            inviteMutation.mutate();
          }}
          className={styles.inviteForm}
        >
          <input
            type="email"
            className={styles.input}
            placeholder="email@esempio.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <select
            className={styles.select}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as RoleOption)}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
            <option value="owner">Owner</option>
          </select>
          <button
            type="submit"
            className={styles.inviteBtn}
            disabled={inviteMutation.isPending || !inviteEmail.trim()}
          >
            {inviteMutation.isPending ? "Invio…" : "Invita"}
          </button>
        </form>
        {inviteError && <p className={styles.errorMsg}>{inviteError}</p>}
      </section>

      {actionError && <p className={styles.errorMsg}>{actionError}</p>}

      {/* Members list */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Membri ({team.members.length})</h2>
        <ul className={styles.list} data-testid="members-list">
          {team.members.map((member) => (
            <li key={member.id} className={styles.row}>
              <div className={styles.memberAvatar}>
                {member.userId.slice(0, 2).toUpperCase()}
              </div>
              <span className={styles.memberId}>{member.userId}</span>
              <select
                className={styles.roleSelect}
                value={member.role}
                disabled={
                  member.userId === currentUserId || roleMutation.isPending
                }
                onChange={(e) =>
                  roleMutation.mutate({
                    userId: member.userId,
                    role: e.target.value as RoleOption,
                  })
                }
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              {member.userId !== currentUserId && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Rimuovi membro"
                  disabled={removeMemMutation.isPending}
                  onClick={() => removeMemMutation.mutate(member.userId)}
                >
                  <UserMinus size={14} strokeWidth={1.5} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Inviti in attesa ({pendingInvitations.length})
          </h2>
          <ul className={styles.list} data-testid="invitations-list">
            {pendingInvitations.map((inv) => (
              <li key={inv.id} className={styles.row}>
                <div className={`${styles.memberAvatar} ${styles.pending}`}>
                  {inv.email.slice(0, 2).toUpperCase()}
                </div>
                <span className={styles.memberId}>{inv.email}</span>
                <span className={styles.badge}>{inv.role}</span>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Reinvia invito"
                  disabled={resendMutation.isPending}
                  onClick={() => resendMutation.mutate(inv.id)}
                >
                  <RotateCcw size={14} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Revoca invito"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(inv.id)}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
