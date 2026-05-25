import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { createTeam } from "../server/teams.server";
import styles from "./TeamCreationPage.module.css";

export function TeamCreationPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (teamName: string) =>
      unwrapResult(await createTeam({ data: { name: teamName } })),
    onSuccess: (team) => {
      void navigate({ to: "/teams/$slug", params: { slug: team.slug } });
    },
    onError: (e: { message?: string }) => {
      setError(e.message ?? "Errore durante la creazione del team.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate(name);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Nuovo team</h1>
        <p className={styles.subtitle}>
          Crea un team per collaborare sui tuoi progetti.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="team-name" className={styles.label}>
              Nome del team
            </label>
            <input
              id="team-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Studio Rossini"
              maxLength={100}
              required
              autoFocus
            />
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => void navigate({ to: "/dashboard" })}
              disabled={mutation.isPending}
            >
              Annulla
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={mutation.isPending || !name.trim()}
            >
              {mutation.isPending ? "Creazione…" : "Crea team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
