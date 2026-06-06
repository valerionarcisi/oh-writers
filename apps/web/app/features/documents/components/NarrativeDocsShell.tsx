import { useMemo, type ReactNode } from "react";
import { VersionTrigger, Viewbar } from "@oh-writers/ui";
import type { DocumentType } from "@oh-writers/domain";
import { LoglinePill } from "./LoglinePill";
import {
  SaveStatusIndicator,
  useTopBarSlotPublisher,
} from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import styles from "./NarrativeDocsShell.module.css";

type NarrativeLayoutVariant = "single" | "two" | "three";

export interface NarrativeDocsShellProps {
  readonly projectId: string;
  readonly docType: DocumentType;
  readonly layout: NarrativeLayoutVariant;
  readonly logline: string;
  readonly canEditLogline: boolean;
  readonly onLoglineChange?: (next: string) => void;
  /** Persist the logline immediately (manual save button in the pill). */
  readonly onLoglineSave?: () => void;
  /** Logline has unsaved edits. */
  readonly loglineIsDirty?: boolean;
  /** A logline save is in flight. */
  readonly loglineIsSaving?: boolean;
  readonly versionLabel?: string;
  /** The current version's draft colour (hex/CSS), shown as the chip's dot. */
  readonly versionDotColor?: string;
  readonly versionMenuItems?: ReadonlyArray<{
    id: string;
    label: string;
    onSelect: () => void;
    tone?: "default" | "muted";
  }>;
  readonly onOpenVersions?: () => void;
  /** Optional extra actions rendered in the TopBar right slot (e.g. export button).
   *  When provided, the logline is promoted to the TopBar center slot and the
   *  Viewbar is hidden. */
  readonly topBarActions?: ReactNode;
  readonly leftAside?: ReactNode;
  readonly rightAside?: ReactNode;
  readonly children: ReactNode;
}

export function NarrativeDocsShell({
  projectId,
  docType: _docType,
  layout,
  logline,
  canEditLogline,
  onLoglineChange,
  onLoglineSave,
  loglineIsDirty,
  loglineIsSaving,
  versionLabel,
  versionDotColor,
  versionMenuItems,
  onOpenVersions,
  topBarActions,
  leftAside,
  rightAside,
  children,
}: NarrativeDocsShellProps) {
  const { t } = useTranslation();
  // Spec 44 TKT-LEAD-04 — the document-type subtabs row was removed: the
  // LeftRail already navigates to the four narrative doc types, so the
  // SegmentedControl + active-doc label duplicated the rail's selection
  // and showed the active type's name twice in a row. The Viewbar now
  // hosts only the doc-scoped affordances (logline, save state, versions).
  void _docType;

  // When topBarActions is provided, promote logline to the shell TopBar center
  // slot so it sits on the same row as the section crumb. The Viewbar is hidden.
  const loglinePill = useMemo(
    () =>
      topBarActions !== undefined ? (
        <LoglinePill
          projectId={projectId}
          logline={logline}
          canEdit={canEditLogline && onLoglineChange !== undefined}
          onChange={onLoglineChange}
          onSave={onLoglineSave}
          isDirty={loglineIsDirty}
          isSaving={loglineIsSaving}
        />
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projectId,
      logline,
      canEditLogline,
      !!onLoglineChange,
      !!topBarActions,
      !!onLoglineSave,
      loglineIsDirty,
      loglineIsSaving,
    ],
  );

  // The version chip — a dedicated, stable TopBar entry point to the Versions
  // surface (Spec 66). Published whenever the page wires `onOpenVersions`, so it
  // never depends on the per-page actions menu rendering. Shows the current
  // version label (fallback "Versioni") + the draft-colour dot.
  const versionChip = useMemo(
    () =>
      onOpenVersions !== undefined ? (
        <VersionTrigger
          variant="pill"
          label={t("documents.shell.openVersions")}
          versionLabel={versionLabel ?? t("documents.shell.versions")}
          dotColor={versionDotColor}
          onClick={onOpenVersions}
          data-testid="topbar-version-chip"
        />
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!onOpenVersions, versionLabel, versionDotColor, onOpenVersions],
  );

  useTopBarSlotPublisher("center", loglinePill);
  useTopBarSlotPublisher("actions", topBarActions ?? null);
  useTopBarSlotPublisher("versionSelector", versionChip);

  const showViewbar = topBarActions === undefined;

  return (
    <div className={styles.shell} data-testid="narrative-docs-shell">
      {showViewbar && (
        <div className={styles.viewbarWrap}>
          <Viewbar>
            <div className={styles.viewbarRow}>
              <LoglinePill
                projectId={projectId}
                logline={logline}
                canEdit={canEditLogline && onLoglineChange !== undefined}
                onChange={onLoglineChange}
                onSave={onLoglineSave}
                isDirty={loglineIsDirty}
                isSaving={loglineIsSaving}
              />
              <div className={styles.viewbarRight}>
                <SaveStatusIndicator />
                {onOpenVersions !== undefined && (
                  <VersionTrigger
                    variant="pill"
                    versionLabel={versionLabel}
                    menuItems={
                      versionMenuItems && versionMenuItems.length > 0
                        ? versionMenuItems
                        : [
                            {
                              id: "open-drawer",
                              label: t("documents.shell.openVersions"),
                              onSelect: onOpenVersions,
                            },
                          ]
                    }
                  />
                )}
              </div>
            </div>
          </Viewbar>
        </div>
      )}

      <main
        className={styles.layout}
        data-variant={layout}
        data-testid={`narrative-layout-${layout}`}
      >
        {layout === "three" && leftAside !== undefined && (
          <aside className={styles.left}>{leftAside}</aside>
        )}
        <section className={styles.editor}>{children}</section>
        {(layout === "two" || layout === "three") &&
          rightAside !== undefined && (
            <aside className={styles.right}>{rightAside}</aside>
          )}
      </main>
    </div>
  );
}
