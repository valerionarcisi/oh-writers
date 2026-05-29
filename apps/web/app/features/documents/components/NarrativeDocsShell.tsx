import { type ReactNode } from "react";
import { VersionTrigger, Viewbar } from "@oh-writers/ui";
import type { DocumentType } from "@oh-writers/domain";
import { LoglinePill } from "./LoglinePill";
import { SaveStatusIndicator } from "~/features/app-shell";
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

  return (
    <div className={styles.shell} data-testid="narrative-docs-shell">
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
