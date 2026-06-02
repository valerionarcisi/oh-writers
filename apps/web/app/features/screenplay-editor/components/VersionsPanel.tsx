import { useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import {
  DRAFT_REVISION_COLORS,
  type DraftRevisionColor,
} from "@oh-writers/domain";
import { Skeleton } from "@oh-writers/ui";
import {
  useVersions,
  useCreateManualVersion,
  useRenameVersion,
  useDuplicateVersion,
  useDeleteVersion,
  useUpdateVersionMeta,
} from "../hooks/useVersions";
import type { VersionView } from "../screenplay-versions.schema";
import { DRAFT_COLOR_HEX, DRAFT_COLOR_LABEL } from "~/features/projects";
import { useTranslation } from "~/features/i18n";
import styles from "./VersionsPanel.module.css";

interface VersionsPanelProps {
  screenplayId: string;
  isOpen: boolean;
  onClose: () => void;
  viewingVersionId?: string | null;
  onView?: (version: VersionView) => void;
}

/**
 * Inline versions panel that drops in between the toolbar and the editor.
 * Owns just the three writer-facing actions: Add, Rename, Duplicate, plus
 * Delete for housekeeping. Restore/Diff stay on the dedicated route for now.
 */
export function VersionsPanel({
  screenplayId,
  isOpen,
  onClose,
  viewingVersionId = null,
  onView,
}: VersionsPanelProps) {
  const { t } = useTranslation();
  const { data: result, isLoading } = useVersions(screenplayId);
  const create = useCreateManualVersion();
  const rename = useRenameVersion(screenplayId);
  const duplicate = useDuplicateVersion(screenplayId);
  const del = useDeleteVersion(screenplayId);
  const updateMeta = useUpdateVersionMeta(screenplayId);

  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const versions: VersionView[] = result && result.isOk ? result.value : [];
  const loadError: string | null =
    result && !result.isOk
      ? match(result.error)
          .with({ _tag: "VersionNotFoundError" }, () =>
            t("screenplay.versionsPanel.error.versionNotFound"),
          )
          .with({ _tag: "ScreenplayNotFoundError" }, () =>
            t("screenplay.versionsPanel.error.screenplayNotFound"),
          )
          .with({ _tag: "ProjectNotFoundError" }, () =>
            t("screenplay.versionsPanel.error.projectNotFound"),
          )
          .with({ _tag: "ForbiddenError" }, () =>
            t("screenplay.versionsPanel.error.forbidden"),
          )
          .with({ _tag: "DbError" }, () =>
            t("screenplay.versionsPanel.error.db"),
          )
          .exhaustive()
      : null;

  const handleCreate = () => {
    const label = newLabel.trim();
    if (!label) return;
    setError(null);
    create.mutate(
      { screenplayId, label },
      {
        onSuccess: () => {
          setNewLabel("");
          setCreating(false);
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Create failed"),
      },
    );
  };

  const handleRenameSubmit = (versionId: string) => {
    const label = renameLabel.trim();
    if (!label) return;
    setError(null);
    rename.mutate(
      { versionId, label },
      {
        onSuccess: () => {
          setRenamingId(null);
          setRenameLabel("");
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Rename failed"),
      },
    );
  };

  const handleDuplicate = (version: VersionView) => {
    setError(null);
    const baseLabel = version.label ?? "Auto-save";
    duplicate.mutate(
      {
        versionId: version.id,
        label: `${t("screenplay.versionsPanel.versionFallbackPrefix")} ${versions.length + 1}`,
      },
      {
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Duplicate failed"),
      },
    );
  };

  const handleSetColor = (
    versionId: string,
    color: DraftRevisionColor | null,
  ) => {
    setError(null);
    updateMeta.mutate(
      { versionId, draftColor: color },
      {
        onSuccess: () => setColorPickerFor(null),
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Color update failed"),
      },
    );
  };

  const handleSetDate = (versionId: string, date: string | null) => {
    setError(null);
    updateMeta.mutate(
      { versionId, draftDate: date },
      {
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Date update failed"),
      },
    );
  };

  const handleDelete = (versionId: string) => {
    setError(null);
    del.mutate(
      { versionId },
      {
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Delete failed"),
      },
    );
  };

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="region"
      aria-label="Versions"
      data-testid="versions-panel"
    >
      <div className={styles.header}>
        <span className={styles.title}>
          {t("screenplay.versionsPanel.title")}
        </span>
        {creating ? (
          <div className={styles.createForm}>
            <input
              className={styles.labelInput}
              type="text"
              placeholder={t("screenplay.versionsPanel.labelPlaceholder")}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewLabel("");
                }
              }}
              autoFocus
              maxLength={100}
              data-testid="versions-new-label-input"
            />
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleCreate}
              disabled={create.isPending || !newLabel.trim()}
              data-testid="versions-new-save"
            >
              {create.isPending ? "…" : t("screenplay.versionsPanel.save")}
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                setCreating(false);
                setNewLabel("");
              }}
            >
              {t("screenplay.versionsPanel.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setCreating(true)}
            data-testid="versions-new-trigger"
          >
            {t("screenplay.versionsPanel.newVersion")}
          </button>
        )}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t("screenplay.versionsPanel.closeAria")}
          title={t("screenplay.versionsPanel.closeTitle")}
        >
          ✕
        </button>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {loadError && (
        <div
          className={styles.error}
          role="alert"
          data-testid="versions-load-error"
        >
          {loadError}
        </div>
      )}

      <div className={styles.body}>
        {isLoading && (
          <div className={styles.status}>
            <Skeleton
              lines={4}
              widths={["70%", "100%", "60%", "100%"]}
              ariaLabel={t("screenplay.versionsPanel.loading")}
            />
          </div>
        )}
        {!isLoading && versions.length === 0 && (
          <div className={styles.empty}>
            {t("screenplay.versionsPanel.empty")}
          </div>
        )}
        {!isLoading && versions.length > 0 && (
          <ul className={styles.list}>
            {versions.map((v) => {
              const isRenaming = renamingId === v.id;
              const isViewing = viewingVersionId === v.id;
              return (
                <li
                  key={v.id}
                  className={`${styles.row} ${isViewing ? styles.rowViewing : ""}`}
                  data-testid={`version-row-${v.id}`}
                  data-viewing={isViewing || undefined}
                >
                  <div className={styles.rowMeta}>
                    <div className={styles.labelRow}>
                      <button
                        type="button"
                        className={styles.swatchBtn}
                        style={{
                          background: v.draftColor
                            ? DRAFT_COLOR_HEX[
                                v.draftColor as DraftRevisionColor
                              ]
                            : "transparent",
                        }}
                        title={
                          v.draftColor
                            ? DRAFT_COLOR_LABEL[
                                v.draftColor as DraftRevisionColor
                              ]
                            : "Set draft color"
                        }
                        aria-label={
                          v.draftColor
                            ? `Draft color: ${v.draftColor}`
                            : "Set draft color"
                        }
                        onClick={() =>
                          setColorPickerFor(
                            colorPickerFor === v.id ? null : v.id,
                          )
                        }
                        data-testid={`version-color-trigger-${v.id}`}
                      >
                        {!v.draftColor && (
                          <span className={styles.swatchEmpty}>?</span>
                        )}
                      </button>
                      {isRenaming ? (
                        <input
                          className={styles.renameInput}
                          type="text"
                          value={renameLabel}
                          onChange={(e) => setRenameLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSubmit(v.id);
                            if (e.key === "Escape") {
                              setRenamingId(null);
                              setRenameLabel("");
                            }
                          }}
                          autoFocus
                          maxLength={100}
                          data-testid={`version-rename-input-${v.id}`}
                        />
                      ) : (
                        <span className={styles.label}>
                          {v.label ?? t("screenplay.versionsPanel.unnamed")}
                        </span>
                      )}
                    </div>
                    {colorPickerFor === v.id && (
                      <div
                        className={styles.colorPicker}
                        role="group"
                        aria-label="Draft color"
                        data-testid={`version-color-picker-${v.id}`}
                      >
                        {DRAFT_REVISION_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={styles.swatch}
                            style={{ background: DRAFT_COLOR_HEX[color] }}
                            aria-label={DRAFT_COLOR_LABEL[color]}
                            aria-pressed={v.draftColor === color}
                            title={DRAFT_COLOR_LABEL[color]}
                            data-testid={`version-color-${v.id}-${color}`}
                            onClick={() => handleSetColor(v.id, color)}
                          />
                        ))}
                        <button
                          type="button"
                          className={`${styles.swatch} ${styles.swatchClear}`}
                          aria-label="Clear color"
                          aria-pressed={v.draftColor === null}
                          data-testid={`version-color-${v.id}-clear`}
                          onClick={() => handleSetColor(v.id, null)}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <div className={styles.metaRow}>
                      <label
                        className={styles.draftDateLabel}
                        htmlFor={`version-draft-date-${v.id}`}
                      >
                        <span>Draft</span>
                        <input
                          id={`version-draft-date-${v.id}`}
                          type="date"
                          className={styles.dateInput}
                          value={v.draftDate ?? ""}
                          data-testid={`version-draft-date-${v.id}`}
                          onChange={(e) =>
                            handleSetDate(v.id, e.target.value || null)
                          }
                        />
                      </label>
                      <span className={styles.date}>
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                      <span className={styles.pages}>
                        {v.pageCount}{" "}
                        {v.pageCount === 1
                          ? t("screenplay.versionsPanel.pageSingular")
                          : t("screenplay.versionsPanel.pagePlural")}
                      </span>
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    {isRenaming ? (
                      <>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={() => handleRenameSubmit(v.id)}
                          disabled={rename.isPending || !renameLabel.trim()}
                          data-testid={`version-rename-save-${v.id}`}
                        >
                          {t("screenplay.versionsPanel.save")}
                        </button>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => {
                            setRenamingId(null);
                            setRenameLabel("");
                          }}
                        >
                          {t("screenplay.versionsPanel.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        {onView && (
                          <button
                            type="button"
                            className={`${styles.primaryBtn} ${isViewing ? styles.activeBtn : ""}`}
                            onClick={() => onView(v)}
                            data-testid={`version-view-${v.id}`}
                            aria-pressed={isViewing}
                          >
                            {isViewing
                              ? t("screenplay.versionsPanel.viewing")
                              : t("screenplay.versionsPanel.view")}
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => {
                            setRenamingId(v.id);
                            setRenameLabel(v.label ?? "");
                          }}
                          data-testid={`version-rename-${v.id}`}
                        >
                          {t("screenplay.versionsPanel.rename")}
                        </button>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => handleDuplicate(v)}
                          disabled={duplicate.isPending}
                          data-testid={`version-duplicate-${v.id}`}
                        >
                          {t("screenplay.versionsPanel.duplicate")}
                        </button>
                        <button
                          type="button"
                          className={`${styles.ghostBtn} ${styles.dangerBtn}`}
                          onClick={() => handleDelete(v.id)}
                          disabled={del.isPending}
                          data-testid={`version-delete-${v.id}`}
                        >
                          {t("screenplay.versionsPanel.delete")}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
