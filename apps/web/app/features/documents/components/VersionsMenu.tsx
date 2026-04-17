import { useEffect, useRef, useState } from "react";
import styles from "./VersionsMenu.module.css";

export interface VersionMenuItem {
  id: string;
  number: number;
  label: string | null;
}

interface VersionsMenuProps {
  versions: readonly VersionMenuItem[];
  currentVersionId: string | null;
  canEdit: boolean;
  onSwitch: (versionId: string) => void;
  onRename: (versionId: string, label: string | null) => void;
  onDelete: (versionId: string) => void;
  onCreateFromScratch: () => void;
  onDuplicateCurrent: () => void;
  onCompare?: () => void;
  isBusy?: boolean;
}

export function VersionsMenu({
  versions,
  currentVersionId,
  canEdit,
  onSwitch,
  onRename,
  onDelete,
  onCreateFromScratch,
  onDuplicateCurrent,
  onCompare,
  isBusy,
}: VersionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setEditingId(null);
  };

  const startRename = (v: VersionMenuItem) => {
    setEditingId(v.id);
    setDraftLabel(v.label ?? "");
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = draftLabel.trim();
    onRename(editingId, trimmed.length > 0 ? trimmed : null);
    setEditingId(null);
  };

  const cancelRename = () => setEditingId(null);

  const handleSwitch = (id: string) => {
    if (id !== currentVersionId) onSwitch(id);
    close();
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this version? This cannot be undone.")) {
      onDelete(id);
    }
  };

  const displayLabel = (v: VersionMenuItem) =>
    v.label && v.label.length > 0 ? v.label : `VERSION-${v.number}`;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-testid="versions-menu-trigger"
      >
        Versions ▾
      </button>
      {isOpen && (
        <div
          className={styles.popover}
          role="menu"
          data-testid="versions-menu-popover"
        >
          <ul className={styles.list}>
            {versions.map((v) => {
              const isCurrent = v.id === currentVersionId;
              const isEditing = editingId === v.id;
              const isOnly = versions.length <= 1;
              const deleteDisabled = !canEdit || isCurrent || isOnly;
              const deleteTitle = !canEdit
                ? "Viewers cannot delete"
                : isCurrent
                  ? "Cannot delete the current version — switch first"
                  : isOnly
                    ? "Cannot delete the only version"
                    : "Delete version";
              return (
                <li
                  key={v.id}
                  className={`${styles.row} ${isCurrent ? styles.rowCurrent : ""}`}
                  data-testid={`versions-menu-row-${v.id}`}
                >
                  <span className={styles.dot} aria-hidden>
                    {isCurrent ? "●" : "○"}
                  </span>
                  {isEditing ? (
                    <input
                      className={styles.renameInput}
                      type="text"
                      value={draftLabel}
                      autoFocus
                      maxLength={80}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        else if (e.key === "Escape") cancelRename();
                      }}
                      onBlur={commitRename}
                      data-testid={`versions-menu-rename-input-${v.id}`}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.label}
                      onClick={() => handleSwitch(v.id)}
                      data-testid={`versions-menu-switch-${v.id}`}
                    >
                      {displayLabel(v)}
                      {isCurrent && (
                        <span className={styles.currentBadge}>current</span>
                      )}
                    </button>
                  )}
                  {canEdit && !isEditing && (
                    <>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => startRename(v)}
                        title="Rename"
                        aria-label="Rename version"
                        data-testid={`versions-menu-rename-${v.id}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => handleDelete(v.id)}
                        disabled={deleteDisabled}
                        title={deleteTitle}
                        aria-label="Delete version"
                        data-testid={`versions-menu-delete-${v.id}`}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <>
              <div className={styles.divider} />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => {
                    onCreateFromScratch();
                    close();
                  }}
                  disabled={isBusy}
                  data-testid="versions-menu-new-scratch"
                >
                  + New version from scratch
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => {
                    onDuplicateCurrent();
                    close();
                  }}
                  disabled={isBusy || !currentVersionId}
                  data-testid="versions-menu-duplicate"
                >
                  🗗 Duplicate current
                </button>
                {onCompare && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => {
                      onCompare();
                      close();
                    }}
                    data-testid="versions-menu-compare"
                  >
                    ⇄ Compare versions…
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
