import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { match } from "ts-pattern";
import {
  useVersions,
  useCreateManualVersion,
  useDeleteVersion,
  useRestoreVersion,
} from "../hooks/useVersions";
import type { VersionView } from "../screenplay-versions.schema";
import { ResultErrorView } from "~/components/ResultErrorView";
import { useTranslation } from "~/features/i18n";
import styles from "./VersionsList.module.css";

interface VersionsListProps {
  projectId: string;
  screenplayId: string;
}

export function VersionsList({ projectId, screenplayId }: VersionsListProps) {
  const { data: result, isLoading } = useVersions(screenplayId);

  if (isLoading) return <LoadingStatus />;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <VersionsListContent
        projectId={projectId}
        screenplayId={screenplayId}
        versions={value}
      />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}

function LoadingStatus() {
  const { t } = useTranslation();
  return (
    <div className={styles.status}>{t("screenplay.versionsList.loading")}</div>
  );
}

interface VersionsListContentProps {
  projectId: string;
  screenplayId: string;
  versions: ReadonlyArray<VersionView>;
}

function VersionsListContent({
  projectId,
  screenplayId,
  versions,
}: VersionsListContentProps) {
  const { t } = useTranslation();
  const createVersion = useCreateManualVersion();
  const deleteVersion = useDeleteVersion(screenplayId);
  const restoreVersion = useRestoreVersion();
  const navigate = useNavigate();
  const [labelInput, setLabelInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!labelInput.trim()) return;
    createVersion.mutate(
      { screenplayId, label: labelInput.trim() },
      {
        onSuccess: () => {
          setLabelInput("");
          setIsCreating(false);
        },
      },
    );
  };

  const handleRestore = (versionId: string) => {
    restoreVersion.mutate(
      { versionId },
      {
        onSuccess: () => {
          void navigate({
            to: "/projects/$id/screenplay",
            params: { id: projectId },
          });
        },
      },
    );
  };

  const handleDelete = (versionId: string) => {
    setDeleteError(null);
    deleteVersion.mutate(
      { versionId },
      {
        onError: (e) => {
          setDeleteError(
            e instanceof Error
              ? e.message
              : t("screenplay.versionsList.deleteFailed"),
          );
        },
      },
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link
          to="/projects/$id/screenplay"
          params={{ id: projectId }}
          className={styles.backLink}
        >
          {t("screenplay.versionsList.backToEditor")}
        </Link>
        <span className={styles.title}>
          {t("screenplay.versionsList.title")}
        </span>
        <button
          className={styles.createBtn}
          type="button"
          onClick={() => setIsCreating((v) => !v)}
        >
          {t("screenplay.versionsList.save")}
        </button>
      </div>

      {isCreating && (
        <div className={styles.createForm}>
          <input
            className={styles.labelInput}
            type="text"
            placeholder={t("screenplay.versionsList.labelPlaceholder")}
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
            maxLength={100}
          />
          <button
            className={styles.saveBtn}
            type="button"
            onClick={handleCreate}
            disabled={createVersion.isPending || !labelInput.trim()}
          >
            {createVersion.isPending
              ? t("screenplay.versionsList.saving")
              : t("screenplay.versionsList.saveAction")}
          </button>
          <button
            className={styles.cancelBtn}
            type="button"
            onClick={() => {
              setIsCreating(false);
              setLabelInput("");
            }}
          >
            {t("screenplay.versionsList.cancel")}
          </button>
        </div>
      )}

      {deleteError && <div className={styles.error}>{deleteError}</div>}

      {versions.length === 0 ? (
        <div className={styles.empty}>
          {t("screenplay.versionsList.empty")}
        </div>
      ) : (
        <div className={styles.sections}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {t("screenplay.versionsList.title")}
            </h2>
            <ul className={styles.list}>
              {versions.map((v) => (
                <VersionRow
                  key={v.id}
                  version={v}
                  projectId={projectId}
                  screenplayId={screenplayId}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                  isRestoring={restoreVersion.isPending}
                  isDeleting={deleteVersion.isPending}
                />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

interface VersionRowProps {
  version: VersionView;
  projectId: string;
  screenplayId: string;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  isRestoring: boolean;
  isDeleting: boolean;
}

function VersionRow({
  version,
  projectId,
  screenplayId,
  onRestore,
  onDelete,
  isRestoring,
  isDeleting,
}: VersionRowProps) {
  const { t } = useTranslation();
  return (
    <li className={styles.row}>
      <div className={styles.rowMeta}>
        <span className={styles.label}>
          {version.label ?? t("screenplay.versionsList.unnamed")}
        </span>
        <span className={styles.date}>
          {version.createdAt.toLocaleDateString()}{" "}
          {version.createdAt.toLocaleTimeString()}
        </span>
        <span className={styles.pages}>
          {version.pageCount}{" "}
          {version.pageCount === 1
            ? t("screenplay.versionsList.page")
            : t("screenplay.versionsList.pages")}
        </span>
      </div>
      <div className={styles.rowActions}>
        <Link
          to="/projects/$id/screenplay/versions/$vId"
          params={{ id: projectId, vId: version.id }}
          className={styles.actionLink}
        >
          {t("screenplay.versionsList.view")}
        </Link>
        <Link
          to="/projects/$id/screenplay/diff/$v1/$v2"
          params={{ id: projectId, v1: version.id, v2: "current" }}
          className={styles.actionLink}
        >
          {t("screenplay.versionsList.diffVsCurrent")}
        </Link>
        <button
          className={styles.actionBtn}
          type="button"
          onClick={() => onRestore(version.id)}
          disabled={isRestoring}
        >
          {t("screenplay.versionsList.restore")}
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          type="button"
          onClick={() => onDelete(version.id)}
          disabled={isDeleting}
          data-testid={`delete-version-${version.id}`}
        >
          {t("screenplay.versionsList.delete")}
        </button>
      </div>
    </li>
  );
}
