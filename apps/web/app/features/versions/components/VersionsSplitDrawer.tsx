// apps/web/app/features/versions/components/VersionsSplitDrawer.tsx
//
// The master→detail Versions surface (Spec 66 / ADR-0004). A THIN, fully
// editor-agnostic presentation module hosted in the routed SplitDrawer.
//
//   list (left)  →  click a version  →  detail (right): the version's full
//   content, formatted and READ-ONLY, with Attiva / Indietro + per-version
//   actions (rename · duplicate · draft-colour dot).
//
// There is NO diff and NO "compare two" mode (ADR-0004): the writer reads an old
// version and brings it back with Attiva. The actions are available from BOTH the
// list row and the open detail.
//
// The drawer owns no data fetching, no routing, and no editor: the host supplies
// the loaded `versions`, the bound mutation callbacks, and a `renderContent`
// render-prop that draws the read-only body for the document kind (narrative HTML
// vs. screenplay PM). This keeps the component free of any cross-feature editor
// import (CLAUDE.md) and reusable for every document type.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { collapseVersions } from "../collapse-versions";
import { DRAFT_REVISION_COLORS } from "@oh-writers/domain";
import type {
  DraftRevisionColor,
  TranslationKey,
  Locale,
} from "@oh-writers/domain";
import { formatDateTime } from "@oh-writers/domain";
import { Skeleton, Popover, useConfirmDialog } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import { DRAFT_COLOR_HEX, DRAFT_COLOR_LABEL } from "~/features/projects";
import type { VersionView } from "../version-view";
import styles from "./VersionsSplitDrawer.module.css";

type Translate = (key: TranslationKey) => string;

// The draft-colour swatch + its palette. The palette lives in the collision-aware
// `Popover` primitive (react-aria dismiss) anchored to the swatch, so opening it
// never reflows the action row (Notion-style).
function ColorSwatchPicker({
  version,
  canEdit,
  onSetColor,
  t,
}: {
  version: VersionView;
  canEdit: boolean;
  onSetColor: (versionId: string, color: DraftRevisionColor | null) => void;
  t: Translate;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const choose = (color: DraftRevisionColor | null) => {
    onSetColor(version.id, color);
    setIsOpen(false);
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.swatchBtn}
        style={
          version.draftColor
            ? { background: DRAFT_COLOR_HEX[version.draftColor] }
            : undefined
        }
        onClick={() => setIsOpen((o) => !o)}
        disabled={!canEdit}
        title={
          version.draftColor
            ? DRAFT_COLOR_LABEL[version.draftColor]
            : t("versions.split.setColor")
        }
        aria-label={t("versions.split.colorPicker")}
        aria-expanded={isOpen}
        data-testid={`version-color-trigger-${version.id}`}
      />
      <Popover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        placement="bottom-start"
      >
        <div
          className={styles.colorPicker}
          role="group"
          aria-label={t("versions.split.colorPicker")}
          data-testid={`version-color-picker-${version.id}`}
        >
          {DRAFT_REVISION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={styles.swatch}
              style={{ background: DRAFT_COLOR_HEX[color] }}
              aria-label={DRAFT_COLOR_LABEL[color]}
              aria-pressed={version.draftColor === color}
              title={DRAFT_COLOR_LABEL[color]}
              data-testid={`version-color-${version.id}-${color}`}
              onClick={() => choose(color)}
            />
          ))}
          <button
            type="button"
            className={`${styles.swatch} ${styles.swatchClear}`}
            aria-label={t("versions.split.clearColor")}
            data-testid={`version-color-${version.id}-clear`}
            onClick={() => choose(null)}
          >
            ×
          </button>
        </div>
      </Popover>
    </>
  );
}

export interface VersionsSplitDrawerProps {
  /** The loaded versions, newest first. */
  readonly versions: readonly VersionView[];
  /** The document's current (active) version id — gets the "Current" badge. */
  readonly currentVersionId: string | null;
  readonly isLoading: boolean;
  /** Localised load-error message, or `null`. */
  readonly loadError: string | null;
  /** Render the read-only, formatted body for a version (kind-aware, host-owned). */
  readonly renderContent: (version: VersionView) => ReactNode;
  // ── Mutations (host-bound to the document-kind hooks) ──
  readonly onActivate: (versionId: string) => void;
  readonly onDuplicate: (versionId: string) => void;
  readonly onRename: (versionId: string, label: string) => void;
  /** Delete a version (host-bound). Omitted → no delete affordance. The current
   *  version can never be deleted. */
  readonly onDelete?: (versionId: string) => void;
  readonly onSetColor: (
    versionId: string,
    color: DraftRevisionColor | null,
  ) => void;
  readonly onCreateNew: () => void;
  /** Whether the active user can mutate (false → read-only surface). */
  readonly canEdit: boolean;
  /** Notifies the host when the view switches between list and a version detail,
   *  so the host can widen the lane + collapse the rail only for the detail. */
  readonly onDetailChange?: (isDetailOpen: boolean) => void;
}

const formatCreatedAt = (iso: string, locale: Locale): string =>
  formatDateTime(new Date(iso), locale);

const versionTitle = (v: VersionView, t: Translate): string =>
  v.label && v.label.length > 0
    ? `${v.label} (v${v.number})`
    : `${t("versions.split.versionPrefix")} ${v.number}`;

export function VersionsSplitDrawer({
  versions,
  currentVersionId,
  isLoading,
  loadError,
  renderContent,
  onActivate,
  onDuplicate,
  onRename,
  onDelete,
  onSetColor,
  onCreateNew,
  canEdit,
  onDetailChange,
}: VersionsSplitDrawerProps) {
  const { t, locale } = useTranslation();
  const { confirm } = useConfirmDialog();

  // master→detail: `selectedId === null` shows the list; a selection opens the
  // detail. Selecting persists until the user goes back (Indietro) or the
  // selected version disappears (e.g. deleted).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");

  // Tell the host whenever we cross between list and detail so it can size the
  // lane + collapse the rail only for the detail view.
  useEffect(() => {
    onDetailChange?.(selectedId !== null);
  }, [selectedId, onDetailChange]);

  // Drop a selection that no longer exists (deleted version) back to the list.
  useEffect(() => {
    if (selectedId && !versions.some((v) => v.id === selectedId)) {
      setSelectedId(null);
    }
  }, [versions, selectedId]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  // Spec 76 — collapse a Cesare session's working rows under their checkpoint so
  // the list shows one entry per meaningful checkpoint, not a row per AI turn.
  // Expanding a checkpoint reveals its working history (indented).
  const collapsed = useMemo(() => collapseVersions(versions), [versions]);
  const [expandedSessions, setExpandedSessions] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const toggleSession = (sessionId: string) =>
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });

  const submitRename = (versionId: string) => {
    const label = renameLabel.trim();
    if (label.length > 0) onRename(versionId, label);
    setRenamingId(null);
    setRenameLabel("");
  };

  // One list row (the version's dot, label/rename, current badge, timestamp) +
  // its actions. `isWorking` indents the row when it is nested under a checkpoint.
  const renderVersionRow = (v: VersionView, isWorking: boolean) => {
    const isCurrent = v.id === currentVersionId;
    const isRenaming = renamingId === v.id;
    return (
      <>
        <button
          type="button"
          className={[
            styles.versionRow,
            isWorking ? styles.versionRowNested : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setSelectedId(v.id)}
          data-testid={`versions-split-row-${v.id}`}
        >
          <span
            className={styles.dot}
            style={
              v.draftColor
                ? { background: DRAFT_COLOR_HEX[v.draftColor] }
                : undefined
            }
            data-testid={`version-dot-${v.id}`}
            aria-hidden
          />
          {isRenaming ? (
            <input
              className={styles.renameInput}
              type="text"
              value={renameLabel}
              autoFocus
              maxLength={80}
              placeholder={t("versions.split.namePlaceholder")}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename(v.id);
                if (e.key === "Escape") {
                  setRenamingId(null);
                  setRenameLabel("");
                }
              }}
              data-testid={`version-rename-input-${v.id}`}
            />
          ) : (
            <span className={styles.versionLabel}>{versionTitle(v, t)}</span>
          )}
          {isCurrent && (
            <span
              className={styles.badgeCurrent}
              data-testid={`versions-split-current-${v.id}`}
            >
              <span className={styles.badgeCheck} aria-hidden>
                ✓
              </span>
              {t("versions.split.badgeCurrent")}
            </span>
          )}
          <span className={styles.versionMeta}>
            {formatCreatedAt(v.createdAt, locale)}
          </span>
        </button>
        {renderActions(v)}
      </>
    );
  };

  const renderActions = (v: VersionView) => {
    const isCurrent = v.id === currentVersionId;
    return (
      <div className={styles.actions}>
        {!isCurrent && (
          <button
            type="button"
            className={styles.activateBtn}
            onClick={() => onActivate(v.id)}
            disabled={!canEdit}
            title={t("versions.split.activateTitle")}
            data-testid={`version-activate-${v.id}`}
          >
            {t("versions.split.activate")}
          </button>
        )}
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => {
            setRenamingId(v.id);
            setRenameLabel(v.label ?? "");
          }}
          disabled={!canEdit}
          data-testid={`version-rename-${v.id}`}
        >
          {t("versions.split.rename")}
        </button>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => onDuplicate(v.id)}
          disabled={!canEdit}
          data-testid={`version-duplicate-${v.id}`}
        >
          {t("versions.split.duplicate")}
        </button>
        {onDelete && !isCurrent && (
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={async () => {
              const ok = await confirm({
                title: t("versions.split.deleteTitle"),
                message: t("versions.split.deleteConfirm"),
                confirmLabel: t("versions.split.delete"),
                destructive: true,
              });
              if (ok) {
                onDelete(v.id);
                if (selectedId === v.id) setSelectedId(null);
              }
            }}
            disabled={!canEdit}
            title={t("versions.split.deleteTitle")}
            data-testid={`version-delete-${v.id}`}
          >
            {t("versions.split.delete")}
          </button>
        )}
        <ColorSwatchPicker
          version={v}
          canEdit={canEdit}
          onSetColor={onSetColor}
          t={t}
        />
      </div>
    );
  };

  return (
    <div className={styles.root} data-testid="versions-split-drawer">
      {selected === null ? (
        <div className={styles.list} data-testid="versions-split-list">
          {canEdit && !isLoading && !loadError && (
            <div className={styles.listHeader}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onCreateNew}
                data-testid="version-new"
              >
                {t("versions.split.newVersion")}
              </button>
            </div>
          )}
          {isLoading && (
            <div className={styles.status}>
              <Skeleton
                lines={4}
                widths={["70%", "100%", "60%", "100%"]}
                ariaLabel={t("versions.split.loading")}
              />
            </div>
          )}
          {loadError && (
            <div className={styles.error} role="alert">
              {loadError}
            </div>
          )}
          {!isLoading && !loadError && versions.length === 0 && (
            <div className={styles.empty}>{t("versions.split.empty")}</div>
          )}
          {!isLoading && versions.length > 0 && (
            <ul className={styles.versionList}>
              {collapsed.map((entry) => {
                const v = entry.anchor;
                const sessionId = v.cesareSessionId;
                const hasWorking = entry.working.length > 0;
                const isExpanded = sessionId
                  ? expandedSessions.has(sessionId)
                  : false;
                return (
                  <li key={v.id} className={styles.versionItem}>
                    {renderVersionRow(v, false)}
                    {hasWorking && sessionId && (
                      <button
                        type="button"
                        className={styles.workingToggle}
                        onClick={() => toggleSession(sessionId)}
                        data-testid={`versions-split-toggle-${sessionId}`}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded
                          ? t("versions.split.hideWorking")
                          : `${entry.working.length} ${t(
                              "versions.split.workingCount",
                            )}`}
                      </button>
                    )}
                    {hasWorking && isExpanded && (
                      <ul className={styles.workingList}>
                        {entry.working.map((w) => (
                          <li key={w.id} className={styles.versionItem}>
                            {renderVersionRow(w, true)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className={styles.detail} data-testid="versions-split-detail">
          <div className={styles.detailHeader}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setSelectedId(null)}
              data-testid="versions-split-back"
            >
              ← {t("versions.split.back")}
            </button>
            <span className={styles.detailTitle}>
              {versionTitle(selected, t)}
            </span>
            {selected.id === currentVersionId && (
              <span className={styles.badgeCurrent}>
                {t("versions.split.isCurrent")}
              </span>
            )}
          </div>
          {renderActions(selected)}
          <div
            className={styles.detailBody}
            data-testid="versions-split-content"
          >
            {renderContent(selected)}
          </div>
        </div>
      )}
    </div>
  );
}
