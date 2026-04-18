import { useState, useRef, useEffect, useCallback } from "react";
import {
  DRAFT_REVISION_COLORS,
  type DraftRevisionColor,
} from "@oh-writers/domain";
import {
  DRAFT_COLOR_HEX,
  DRAFT_COLOR_LABEL,
} from "~/features/projects/draft-color-palette";
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
  /** Called when clicking a row (enter view / restore) */
  onSelect?: (item: VersionListItem) => void;
  onCreate: (label: string) => void;
  isCreating?: boolean;
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
}

export function VersionsList({
  items,
  isLoading,
  error,
  activeId,
  onSelect,
  onCreate,
  isCreating,
  onRename,
  isRenaming,
  onDelete,
  isDeleting,
  onDuplicate,
  isDuplicating,
  onUpdateColor,
  onUpdateDate,
}: VersionsListProps) {
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
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
    if (!label) return;
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
        {creating ? (
          <div className={styles.createForm}>
            <input
              ref={newInputRef}
              className={styles.labelInput}
              type="text"
              placeholder="Nome versione"
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
              {isCreating ? "…" : "Salva"}
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                setCreating(false);
                setNewLabel("");
              }}
            >
              Annulla
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.btnNew}
            onClick={() => setCreating(true)}
            data-testid="versions-new-trigger"
          >
            + Nuova versione
          </button>
        )}
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.body}>
        {isLoading && <div className={styles.status}>Caricamento…</div>}
        {!isLoading && items.length === 0 && (
          <div className={styles.empty}>Nessuna versione salvata.</div>
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
                      {isRenaming ? "…" : "Salva"}
                    </button>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => {
                        setRenamingId(null);
                        setRenameLabel("");
                      }}
                    >
                      Annulla
                    </button>
                  </li>
                );
              }

              const isOnlyVersion = items.length === 1;
              const deleteDisabled = isDeleting || isActive || isOnlyVersion;
              const deleteTitle = isOnlyVersion
                ? "Unica versione — non eliminabile"
                : isActive
                  ? "Versione attiva — non eliminabile"
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
                              ? `Draft color: ${item.draftColor}`
                              : "Set draft color"
                          }
                          title={
                            item.draftColor
                              ? DRAFT_COLOR_LABEL[item.draftColor]
                              : "Set draft color"
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
                        {item.label ?? "Senza nome"}
                      </span>
                      {isActive && (
                        <span
                          className={styles.badgeActive}
                          data-testid={`version-badge-active-${item.id}`}
                        >
                          Attiva
                        </span>
                      )}
                      <button
                        type="button"
                        className={styles.pencilBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(item);
                        }}
                        aria-label={`Rinomina ${item.label ?? "versione"}`}
                        data-testid={`version-rename-${item.id}`}
                      >
                        ✎
                      </button>
                    </div>
                    {onUpdateColor && colorPickerFor === item.id && (
                      <div
                        className={styles.colorPicker}
                        role="group"
                        aria-label="Draft color"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`version-color-picker-${item.id}`}
                      >
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
                              onUpdateColor(item.id, color);
                              setColorPickerFor(null);
                            }}
                          />
                        ))}
                        <button
                          type="button"
                          className={`${styles.swatch} ${styles.swatchClear}`}
                          aria-label="Clear color"
                          aria-pressed={!item.draftColor}
                          data-testid={`version-color-${item.id}-clear`}
                          onClick={() => {
                            onUpdateColor(item.id, null);
                            setColorPickerFor(null);
                          }}
                        >
                          ×
                        </button>
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
                      </span>
                      {onUpdateDate && (
                        <label
                          className={styles.draftDateLabel}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>· Draft</span>
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
                  </div>

                  <div className={styles.rowActions}>
                    {onDuplicate && (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate(item.id, item.label ?? "Senza nome");
                        }}
                        disabled={isDuplicating}
                        data-testid={`version-duplicate-${item.id}`}
                      >
                        Duplica
                      </button>
                    )}
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
                      Elimina
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deletingId !== null && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Conferma eliminazione"
          data-testid="version-delete-confirm"
        >
          <div className={styles.confirmBox}>
            <p className={styles.confirmText}>
              Eliminare questa versione? L&apos;operazione non è reversibile.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => {
                  onDelete(deletingId);
                  setDeletingId(null);
                }}
                disabled={isDeleting}
                data-testid="version-delete-confirm-ok"
              >
                Elimina
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setDeletingId(null)}
                data-testid="version-delete-confirm-cancel"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
