import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useVersions,
  useCreateManualVersion,
  useDeleteVersion,
  useRestoreVersion,
} from "../hooks/useVersions";
import type { VersionView } from "../screenplay-versions.schema";
import styles from "./VersionsList.module.css";

interface VersionsListProps {
  projectId: string;
  screenplayId: string;
}

export function VersionsList({ projectId, screenplayId }: VersionsListProps) {
  const { data: result, isLoading } = useVersions(screenplayId);
  const createVersion = useCreateManualVersion();
  const deleteVersion = useDeleteVersion(screenplayId);
  const restoreVersion = useRestoreVersion();
  const navigate = useNavigate();
  const [labelInput, setLabelInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (isLoading) return <div className={styles.status}>Loading versions…</div>;
  if (!result) return null;
  if (!result.isOk)
    return <div className={styles.statusError}>Failed to load versions.</div>;

  const versions = result.value;

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
          setDeleteError(e instanceof Error ? e.message : "Delete failed");
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
          ← Back to Editor
        </Link>
        <span className={styles.title}>Versions</span>
        <button
          className={styles.createBtn}
          type="button"
          onClick={() => setIsCreating((v) => !v)}
        >
          + Save Version
        </button>
      </div>

      {isCreating && (
        <div className={styles.createForm}>
          <input
            className={styles.labelInput}
            type="text"
            placeholder="Version label (e.g. Draft 1)"
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
            {createVersion.isPending ? "Saving…" : "Save"}
          </button>
          <button
            className={styles.cancelBtn}
            type="button"
            onClick={() => {
              setIsCreating(false);
              setLabelInput("");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {deleteError && <div className={styles.error}>{deleteError}</div>}

      {versions.length === 0 ? (
        <div className={styles.empty}>
          No versions yet. Save a version to keep a snapshot.
        </div>
      ) : (
        <div className={styles.sections}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Versions</h2>
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
  return (
    <li className={styles.row}>
      <div className={styles.rowMeta}>
        <span className={styles.label}>{version.label ?? "Senza nome"}</span>
        <span className={styles.date}>
          {version.createdAt.toLocaleDateString()}{" "}
          {version.createdAt.toLocaleTimeString()}
        </span>
        <span className={styles.pages}>
          {version.pageCount} {version.pageCount === 1 ? "page" : "pages"}
        </span>
      </div>
      <div className={styles.rowActions}>
        <Link
          to="/projects/$id/screenplay/versions/$vId"
          params={{ id: projectId, vId: version.id }}
          className={styles.actionLink}
        >
          View
        </Link>
        <Link
          to="/projects/$id/screenplay/diff/$v1/$v2"
          params={{ id: projectId, v1: version.id, v2: "current" }}
          className={styles.actionLink}
        >
          Diff vs current
        </Link>
        <button
          className={styles.actionBtn}
          type="button"
          onClick={() => onRestore(version.id)}
          disabled={isRestoring}
        >
          Restore
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          type="button"
          onClick={() => onDelete(version.id)}
          disabled={isDeleting}
          data-testid={`delete-version-${version.id}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
