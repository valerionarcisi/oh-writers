import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  SegmentedControl,
  VersionTrigger,
  Viewbar,
  ViewbarSep,
} from "@oh-writers/ui";
import type { DocumentType } from "@oh-writers/domain";
import {
  NARRATIVE_TAB_OPTIONS,
  type NarrativeTabId,
  docTypeFromTabId,
  routePathFromTabId,
  tabIdFromDocType,
} from "../lib/narrative-shell";
import { DOCUMENT_LABELS } from "../lib/document-display";
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
  docType,
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
  const navigate = useNavigate();
  const activeTab = tabIdFromDocType(docType) ?? "soggetto";

  const handleSelectTab = (tab: NarrativeTabId) => {
    if (tab === activeTab) return;
    void navigate({
      to: routePathFromTabId(tab, projectId),
    });
    // Silence unused-import warning when the docType helper is only used for
    // type assertions in tests.
    void docTypeFromTabId;
  };

  return (
    <div className={styles.shell} data-testid="narrative-docs-shell">
      <div className={styles.viewbarWrap}>
        <Viewbar>
          <div className={styles.viewbarRow}>
            <SegmentedControl
              options={[...NARRATIVE_TAB_OPTIONS]}
              activeId={activeTab}
              onSelect={handleSelectTab}
              ariaLabel="Documenti narrativi"
            />
            <ViewbarSep />
            <span className={styles.docTypeLabel} aria-current="page">
              {DOCUMENT_LABELS[docType]}
            </span>
            <ViewbarSep />
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
