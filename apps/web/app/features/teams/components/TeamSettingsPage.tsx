import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { match } from "ts-pattern";
import { unwrapResult } from "@oh-writers/utils";
import {
  teamQueryOptions,
  updateTeam,
  deleteTeam,
} from "../server/teams.server";
import styles from "./TeamSettingsPage.module.css";

interface TeamSettingsPageProps {
  slug: string;
  currentUserId: string;
}

export function TeamSettingsPage({
  slug,
  currentUserId,
}: TeamSettingsPageProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: result } = useSuspenseQuery(teamQueryOptions(slug));

  const [name, setName] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      <div className={styles.error}>
        Solo i proprietari possono accedere alle impostazioni.
      </div>
    );
  }

  const displayName = name ?? team.name;

  const saveMutation = useMutation({
    mutationFn: async () =>
      unwrapResult(
        await updateTeam({ data: { teamId: team.id, name: displayName } }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["teams", slug] });
      setSaveError(null);
    },
    onError: (e: { message?: string }) => {
      setSaveError(e.message ?? "Errore durante il salvataggio.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () =>
      unwrapResult(await deleteTeam({ data: { teamId: team.id } })),
    onSuccess: () => {
      void navigate({ to: "/dashboard" });
    },
    onError: (e: { message?: string }) => {
      setDeleteError(e.message ?? "Errore durante l'eliminazione.");
      setShowDeleteConfirm(false);
    },
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Impostazioni team</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Informazioni generali</h2>

        <div className={styles.field}>
          <label htmlFor="team-name" className={styles.label}>
            Nome del team
          </label>
          <input
            id="team-name"
            type="text"
            className={styles.input}
            value={displayName}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </div>

        {saveError && <p className={styles.errorMsg}>{saveError}</p>}

        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || displayName === team.name}
        >
          {saveMutation.isPending ? "Salvataggio…" : "Salva modifiche"}
        </button>
      </section>

      <section className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Zona pericolosa</h2>
        <p className={styles.dangerDescription}>
          L'eliminazione del team è permanente e rimuoverà tutti i dati
          associati.
        </p>

        {deleteError && <p className={styles.errorMsg}>{deleteError}</p>}

        {!showDeleteConfirm ? (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Elimina team
          </button>
        ) : (
          <div className={styles.confirmRow}>
            <span className={styles.confirmText}>
              Sei sicuro? L'azione è irreversibile.
            </span>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setShowDeleteConfirm(false)}
            >
              Annulla
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? "Eliminazione…"
                : "Conferma eliminazione"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
