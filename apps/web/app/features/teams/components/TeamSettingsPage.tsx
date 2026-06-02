import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { match } from "ts-pattern";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
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
  const { t } = useTranslation();
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
          .with({ _tag: "TeamNotFoundError" }, () => t("teams.error.notFound"))
          .with({ _tag: "ForbiddenError" }, () => t("teams.error.forbidden"))
          .otherwise(() => t("teams.error.loadTeam"))}
      </div>
    );
  }

  const team = result.value;
  const membership = team.members.find((m) => m.userId === currentUserId);
  const isOwner = membership?.role === "owner";

  if (!isOwner) {
    return (
      <div className={styles.error}>{t("teams.settings.ownersOnly")}</div>
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
      setSaveError(e.message ?? t("teams.settings.saveError"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () =>
      unwrapResult(await deleteTeam({ data: { teamId: team.id } })),
    onSuccess: () => {
      void navigate({ to: "/dashboard" });
    },
    onError: (e: { message?: string }) => {
      setDeleteError(e.message ?? t("teams.settings.deleteError"));
      setShowDeleteConfirm(false);
    },
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("teams.settings.title")}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("teams.settings.generalTitle")}
        </h2>

        <div className={styles.field}>
          <label htmlFor="team-name" className={styles.label}>
            {t("teams.settings.nameLabel")}
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
          {saveMutation.isPending
            ? t("teams.settings.saving")
            : t("teams.settings.save")}
        </button>
      </section>

      <section className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>{t("teams.settings.dangerTitle")}</h2>
        <p className={styles.dangerDescription}>
          {t("teams.settings.dangerDescription")}
        </p>

        {deleteError && <p className={styles.errorMsg}>{deleteError}</p>}

        {!showDeleteConfirm ? (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t("teams.settings.delete")}
          </button>
        ) : (
          <div className={styles.confirmRow}>
            <span className={styles.confirmText}>
              {t("teams.settings.confirmText")}
            </span>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? t("teams.settings.deleting")
                : t("teams.settings.confirmDelete")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
