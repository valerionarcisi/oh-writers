import { useState, useRef, useEffect, useCallback } from "react";
import { Button, Dialog, Skeleton } from "@oh-writers/ui";
import {
  DRAFT_REVISION_COLORS,
  type DraftRevisionColor,
} from "@oh-writers/domain";
import { DRAFT_COLOR_HEX, DRAFT_COLOR_LABEL } from "~/features/projects";
import { useTranslation } from "~/features/i18n";
import styles from "./VersionsList.module.css";

export interface VersionListItem {
  id: string;
  label: string | null;
  createdAt: string;
  /** Optional secondary info shown below the label (e.g. "3 pagine") */
  sub?: string;
  /** Hollywood revision color of this version (screenplay scope only) */
  draftColor?: DraftRevisionColor | null;
  /** ISO date (YYYY-MM-DD) of this revision (screenplay scope only) */
  draftDate?: string | null;
}

interface VersionsListProps {
  items: VersionListItem[];
  isLoading: boolean;
  error?: string | null;
  activeId?: string | null;
  /** Whether the current user can mutate versions (owner/editor). Defaults to true. */
  canEdit?: boolean;
  /** Called when clicking a row (enter view / restore) */
  onSelect?: (item: VersionListItem) => void;
  onCreate?: (label: string) => void;
  isCreating?: boolean;
  onCreateFromScratch?: () => void;
  isCreatingFromScratch?: boolean;
  onRename: (id: string, label: string) => void;
  isRenaming?: boolean;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
  onDuplicate?: (id: string, baseLabel: string) => void;
  isDuplicating?: boolean;
  /** Set/clear the revision color for a version */
  onUpdateColor?: (id: string, color: DraftRevisionColor | null) => void;
  /** Set/clear the revision date for a version */
  onUpdateDate?: (id: string, date: string | null) => void;
  onCompare?: () => void;
}

export function VersionsList({
  items,
  isLoading,
  error,
  activeId,
  canEdit = true,
  onSelect,
  onCreate,
  isCreating,
  onCreateFromScratch,
  isCreatingFromScratch,
  onRename,
  isRenaming,
  onDelete,
  isDeleting,
  onDuplicate,
  isDuplicating,
  onUpdateColor,
  onUpdateDate,
  onCompare,
}: VersionsListProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [pendingColor, setPendingColor] = useState<{
    id: string;
    from: DraftRevisionColor | null;
    to: DraftRevisionColor | null;
  } | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) newInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleCreate = () => {
    const label = newLabel.trim();
    if (!label || !onCreate) return;
    onCreate(label);
    setNewLabel("");
    setCreating(false);
  };

  const handleRenameSubmit = (id: string) => {
    const label = renameLabel.trim();
    if (!label) return;
    onRename(id, label);
    setRenamingId(null);
    setRenameLabel("");
  };

  const startRename = (item: VersionListItem) => {
    setRenamingId(item.id);
    setRenameLabel(item.label ?? "");
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        {canEdit && (
          <>
            {onCreate &&
              (creating ? (
                <div className={styles.createForm}>
                  <input
                    ref={newInputRef}
                    className={styles.labelInput}
                    type="text"
                    placeholder={t("versions.list.namePlaceholder")}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") {
                        setCreating(false);
                        setNewLabel("");
                      }
                    }}
                    maxLength={100}
                    data-testid="versions-new-label-input"
                  />
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleCreate}
                    disabled={isCreating || !newLabel.trim()}
                    data-testid="versions-new-save"
                  >
                    {isCreating ? "…" : t("versions.list.save")}
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => {
                      setCreating(false);
                      setNewLabel("");
                    }}
                  >
                    {t("versions.list.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.btnNew}
                  onClick={() => setCreating(true)}
                  data-testid="versions-new-trigger"
                >
                  {t("versions.list.new")}
                </button>
              ))}
            {onCreateFromScratch && !creating && (
              <button
                type="button"
                className={styles.btnNew}
                onClick={onCreateFromScratch}
                disabled={isCreatingFromScratch}
                data-testid="versions-new-scratch"
              >
                {isCreatingFromScratch ? "…" : t("versions.list.newScratch")}
              </button>
            )}
          </>
        )}
        {onCompare && items.length >= 2 && (
          <button
            type="button"
            className={styles.btnGhost}
            onClick={onCompare}
            data-testid="versions-compare-trigger"
          >
            {t("versions.list.compare")}
          </button>
        )}
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.body}>
        {isLoading && (
          <div className={styles.status}>
            <Skeleton
              lines={4}
              widths={["70%", "100%", "60%", "100%"]}
              ariaLabel={t("versions.list.loading")}
            />
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className={styles.empty}>{t("versions.list.empty")}</div>
        )}
        {!isLoading && items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item) => {
              const isActive = activeId === item.id;
              const isCurrentlyRenaming = renamingId === item.id;

              if (isCurrentlyRenaming) {
                return (
                  <li key={item.id} className={styles.renameRow}>
                    <input
                      ref={renameInputRef}
                      className={styles.renameInput}
                      type="text"
                      value={renameLabel}
                      onChange={(e) => setRenameLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(item.id);
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameLabel("");
                        }
                      }}
                      maxLength={100}
                      data-testid={`version-rename-input-${item.id}`}
                    />
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => handleRenameSubmit(item.id)}
                      disabled={isRenaming || !renameLabel.trim()}
                      data-testid={`version-rename-save-${item.id}`}
                    >
                      {isRenaming ? "…" : t("versions.list.save")}
                    </button>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => {
                        setRenamingId(null);
                        setRenameLabel("");
                      }}
                    >
                      {t("versions.list.cancel")}
                    </button>
                  </li>
                );
              }

              const isOnlyVersion = items.length === 1;
              const deleteDisabled = isDeleting || isActive || isOnlyVersion;
              const deleteTitle = isOnlyVersion
                ? t("versions.list.deleteOnly")
                : isActive
                  ? t("versions.list.deleteActive")
                  : undefined;

              return (
                <li
                  key={item.id}
                  className={`${styles.row} ${isActive ? styles.rowActive : ""}`}
                  onClick={() => onSelect?.(item)}
                  data-testid={`version-row-${item.id}`}
                  data-active={isActive || undefined}
                >
                  <div className={styles.rowMeta}>
                    <div className={styles.labelRow}>
                      {onUpdateColor && (
                        <button
                          type="button"
                          className={styles.swatchBtn}
                          style={{
                            background: item.draftColor
                              ? DRAFT_COLOR_HEX[item.draftColor]
                              : "transparent",
                          }}
                          aria-label={
                            item.draftColor
                              ? `${t("versions.list.draftColorWithValue")} ${item.draftColor}`
                              : t("versions.list.setDraftColor")
                          }
                          title={
                            item.draftColor
                              ? DRAFT_COLOR_LABEL[item.draftColor]
                              : t("versions.list.setDraftColor")
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setColorPickerFor(
                              colorPickerFor === item.id ? null : item.id,
                            );
                          }}
                          data-testid={`version-color-trigger-${item.id}`}
                        >
                          {!item.draftColor && (
                            <span className={styles.swatchEmpty}>?</span>
                          )}
                        </button>
                      )}
                      <span className={styles.label}>
                        {item.label ?? t("versions.unnamed")}
                      </span>
                      {isActive && (
                        <span
                          className={styles.badgeActive}
                          data-testid={`version-badge-active-${item.id}`}
                        >
                          {t("versions.list.badgeActive")}
                        </span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className={styles.pencilBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(item);
                          }}
                          aria-label={`${t("versions.list.renameAria")} ${item.label ?? t("versions.list.renameFallback")}`}
                          data-testid={`version-rename-${item.id}`}
                        >
                          ✎
                        </button>
                      )}
                    </div>
                    {onUpdateColor && colorPickerFor === item.id && (
                      <div
                        className={styles.colorPicker}
                        role="group"
                        aria-label={t("versions.list.colorPicker")}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`version-color-picker-${item.id}`}
                      >
                        <div className={styles.swatchGrid}>
                          {DRAFT_REVISION_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={styles.swatch}
                              style={{ background: DRAFT_COLOR_HEX[color] }}
                              aria-label={DRAFT_COLOR_LABEL[color]}
                              aria-pressed={item.draftColor === color}
                              title={DRAFT_COLOR_LABEL[color]}
                              data-testid={`version-color-${item.id}-${color}`}
                              onClick={() => {
                                if (item.draftColor === color) {
                                  setColorPickerFor(null);
                                  return;
                                }
                                setPendingColor({
                                  id: item.id,
                                  from: item.draftColor ?? null,
                                  to: color,
                                });
                              }}
                            />
                          ))}
                          <button
                            type="button"
                            className={`${styles.swatch} ${styles.swatchClear}`}
                            aria-label={t("versions.list.clearColor")}
                            aria-pressed={!item.draftColor}
                            data-testid={`version-color-${item.id}-clear`}
                            onClick={() => {
                              if (!item.draftColor) {
                                setColorPickerFor(null);
                                return;
                              }
                              setPendingColor({
                                id: item.id,
                                from: item.draftColor,
                                to: null,
                              });
                            }}
                          >
                            ×
                          </button>
                        </div>
                        {onUpdateDate && (
                          <label className={styles.draftDateLabel}>
                            <span>{t("versions.list.draftDate")}</span>
                            <input
                              type="date"
                              className={styles.dateInput}
                              value={item.draftDate ?? ""}
                              data-testid={`version-draft-date-${item.id}`}
                              onChange={(e) =>
                                onUpdateDate(item.id, e.target.value || null)
                              }
                            />
                          </label>
                        )}
                      </div>
                    )}
                    <div className={styles.sub}>
                      <span>
                        {new Date(item.createdAt).toLocaleString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {item.sub ? ` · ${item.sub}` : ""}
                        {item.draftDate
                          ? ` · ${t("versions.list.draftPrefix")} ${item.draftDate}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  <div className={styles.rowActions}>
                    {!isActive && onSelect && (
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(item);
                        }}
                        data-testid={`version-activate-${item.id}`}
                        title={t("versions.list.activateTitle")}
                      >
                        {t("versions.list.activate")}
                      </button>
                    )}
                    {canEdit && onDuplicate && (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate(item.id, item.label ?? t("versions.unnamed"));
                        }}
                        disabled={isDuplicating}
                        data-testid={`version-duplicate-${item.id}`}
                      >
                        {t("versions.list.duplicate")}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(item.id);
                        }}
                        disabled={deleteDisabled}
                        title={deleteTitle}
                        data-testid={`version-delete-${item.id}`}
                      >
                        {t("versions.list.delete")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingColor !== null && (
        <Dialog
          isOpen
          onClose={() => setPendingColor(null)}
          title={t("versions.list.colorConfirmTitle")}
          isDismissable={false}
          data-testid="version-color-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => setPendingColor(null)}
                data-testid="version-color-confirm-cancel"
              >
                {t("versions.list.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onUpdateColor?.(pendingColor.id, pendingColor.to);
                  setPendingColor(null);
                  setColorPickerFor(null);
                }}
                data-testid="version-color-confirm-ok"
                autoFocus
              >
                {t("versions.list.confirm")}
              </Button>
            </>
          }
        >
          <p>
            {t("versions.list.colorChange1")}{" "}
            <strong>
              {pendingColor.from
                ? DRAFT_COLOR_LABEL[pendingColor.from]
                : t("versions.list.colorNone")}
            </strong>{" "}
            {t("versions.list.colorChange2")}{" "}
            <strong>
              {pendingColor.to
                ? DRAFT_COLOR_LABEL[pendingColor.to]
                : t("versions.list.colorNone")}
            </strong>
            {t("versions.list.colorChange3")}
          </p>
        </Dialog>
      )}

      {deletingId !== null && (
        <Dialog
          isOpen
          onClose={() => setDeletingId(null)}
          title={t("versions.list.deleteConfirmTitle")}
          isDismissable={false}
          data-testid="version-delete-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => setDeletingId(null)}
                data-testid="version-delete-confirm-cancel"
              >
                {t("versions.list.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  onDelete(deletingId);
                  setDeletingId(null);
                }}
                disabled={isDeleting}
                data-testid="version-delete-confirm-ok"
              >
                {t("versions.list.delete")}
              </Button>
            </>
          }
        >
          <p>{t("versions.list.deleteConfirmBody")}</p>
        </Dialog>
      )}
    </div>
  );
}
