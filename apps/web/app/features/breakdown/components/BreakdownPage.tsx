import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Tabs } from "@oh-writers/ui";
import { Suspense } from "react";
import { breakdownContextOptions } from "../hooks/useBreakdown";
import { SceneTOC } from "./SceneTOC";
import { SceneScriptViewer } from "./SceneScriptViewer";
import { BreakdownPanel } from "./BreakdownPanel";
import { ProjectBreakdownTable } from "./ProjectBreakdownTable";
import { ExportBreakdownModal } from "./ExportBreakdownModal";
import { VersionImportBanner } from "./VersionImportBanner";
import styles from "./BreakdownPage.module.css";

interface Props {
  projectId: string;
  canEdit?: boolean;
}

type TabId = "per-scene" | "per-project";

export function BreakdownPage({ projectId, canEdit = true }: Props) {
  return (
    <Suspense fallback={<div className={styles.status}>Caricamento…</div>}>
      <BreakdownPageContent projectId={projectId} canEdit={canEdit} />
    </Suspense>
  );
}

interface ContentProps {
  projectId: string;
  canEdit: boolean;
}

function BreakdownPageContent({ projectId, canEdit }: ContentProps) {
  const { data: ctx } = useSuspenseQuery(breakdownContextOptions(projectId));
  const [activeTab, setActiveTab] = useState<TabId>("per-scene");
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    ctx.scenes[0]?.id ?? null,
  );
  const [exportOpen, setExportOpen] = useState(false);

  const versionId = ctx.screenplayVersionId;
  const activeScene =
    ctx.scenes.find((s) => s.id === activeSceneId) ?? ctx.scenes[0] ?? null;

  return (
    <main className={styles.page} data-testid="breakdown-page">
      <header className={styles.header}>
        <Tabs
          tabs={[
            { id: "per-scene", label: "Per scena" },
            { id: "per-project", label: "Per progetto" },
          ]}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as TabId)}
        />
        {canEdit && (
          <button
            type="button"
            className={styles.exportTrigger}
            data-testid="breakdown-export-trigger"
            onClick={() => setExportOpen(true)}
          >
            Export
          </button>
        )}
      </header>

      <VersionImportBanner projectId={projectId} versionId={versionId} />

      {activeTab === "per-scene" ? (
        <div className={styles.split}>
          <aside className={styles.toc} data-testid="breakdown-toc">
            <SceneTOC
              scenes={ctx.scenes}
              versionId={versionId}
              activeSceneId={activeScene?.id ?? null}
              onSceneSelect={setActiveSceneId}
            />
          </aside>
          <section className={styles.script} data-testid="breakdown-script">
            <SceneScriptViewer
              scene={activeScene}
              projectId={projectId}
              versionId={versionId}
              canEdit={canEdit}
            />
          </section>
          <aside className={styles.panel} data-testid="breakdown-panel">
            <BreakdownPanel
              scene={activeScene}
              projectId={projectId}
              versionId={versionId}
              canEdit={canEdit}
            />
          </aside>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <ProjectBreakdownTable
            projectId={projectId}
            versionId={versionId}
            canEdit={canEdit}
          />
        </div>
      )}

      <ExportBreakdownModal
        projectId={projectId}
        versionId={versionId}
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </main>
  );
}
