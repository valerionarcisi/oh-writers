import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useHydratedInput } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import { createTeam } from "../server/teams.server";
import styles from "./TeamCreationPage.module.css";

export function TeamCreationPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The field is server-rendered and autofocused, so it invites typing before
  // React has wired its onChange. Adopt whatever was typed in that window,
  // otherwise the name sits visibly in the field while `name` stays empty and
  // the submit button never enables (#117).
  const nameRef = useRef<HTMLInputElement>(null);
  useHydratedInput(nameRef, name, setName);

  const mutation = useMutation({
    mutationFn: async (teamName: string) =>
      unwrapResult(await createTeam({ data: { name: teamName } })),
    onSuccess: (team) => {
      void navigate({ to: "/teams/$slug", params: { slug: team.slug } });
    },
    onError: (e: { message?: string }) => {
      setError(e.message ?? t("teams.create.error"));
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
        <h1 className={styles.title}>{t("teams.create.title")}</h1>
        <p className={styles.subtitle}>{t("teams.create.subtitle")}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="team-name" className={styles.label}>
              {t("teams.create.nameLabel")}
            </label>
            <input
              ref={nameRef}
              id="team-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("teams.create.namePlaceholder")}
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
              {t("action.cancel")}
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={mutation.isPending || !name.trim()}
            >
              {mutation.isPending
                ? t("teams.create.creating")
                : t("teams.create.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
