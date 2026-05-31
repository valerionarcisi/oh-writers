import { useMemo, type ReactNode } from "react";
import { VersionTrigger, Viewbar } from "@oh-writers/ui";
import type { DocumentType } from "@oh-writers/domain";
import { LoglinePill } from "./LoglinePill";
import {
  SaveStatusIndicator,
  useTopBarSlotPublisher,
} from "~/features/app-shell";
import styles from "./NarrativeDocsShell.module.css";

type NarrativeLayoutVariant = "single" | "two" | "three";

export interface NarrativeDocsShellProps {
  readonly projectId: string;
  readonly docType: DocumentType;
  readonly layout: NarrativeLayoutVariant;
  readonly logline: string;
  readonly canEditLogline: boolean;
  readonly onLoglineChange?: (next: string) => void;
  readonly versionLabel?: string;
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
  versionLabel,
  versionMenuItems,
  onOpenVersions,
  topBarActions,
  leftAside,
  rightAside,
  children,
}: NarrativeDocsShellProps) {
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
        />
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, logline, canEditLogline, !!onLoglineChange, !!topBarActions],
  );

  useTopBarSlotPublisher("center", loglinePill);
  useTopBarSlotPublisher("actions", topBarActions ?? null);

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
                              label: "Apri Versioni →",
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
