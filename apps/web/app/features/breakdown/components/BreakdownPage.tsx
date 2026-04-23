import { useEffect, useRef, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Tabs } from "@oh-writers/ui";
import { Suspense } from "react";
import {
  breakdownContextOptions,
  breakdownForSceneOptions,
  projectBreakdownOptions,
  useRunAutoSpoglio,
} from "../hooks/useBreakdown";
import { SceneTOC } from "./SceneTOC";
import { ScriptReader, type ScriptReaderHandle } from "./ScriptReader";
import type { ElementForMatch } from "../lib/pm-plugins/find-occurrences";
import type { CesareSuggestionLite } from "../lib/pm-plugins/map-suggestions";
import { BreakdownPanel } from "./BreakdownPanel";
import { ProjectBreakdownTable } from "./ProjectBreakdownTable";
import { ExportBreakdownModal } from "./ExportBreakdownModal";
import { VersionImportBanner } from "./VersionImportBanner";
import styles from "./BreakdownPage.module.css";

interface Props {
  projectId: string;
}

type TabId = "per-scene" | "per-project";

export function BreakdownPage({ projectId }: Props) {
  return (
    <Suspense fallback={<div className={styles.status}>Caricamento…</div>}>
      <BreakdownPageContent projectId={projectId} />
    </Suspense>
  );
}

interface ContentProps {
  projectId: string;
}

function BreakdownPageContent({ projectId }: ContentProps) {
  const { data: ctx } = useSuspenseQuery(breakdownContextOptions(projectId));
  const canEdit = ctx.canEdit;
  const [activeTab, setActiveTab] = useState<TabId>("per-scene");
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    ctx.scenes[0]?.id ?? null,
  );
  const [exportOpen, setExportOpen] = useState(false);

  const versionId = ctx.screenplayVersionId;
  const activeScene =
    ctx.scenes.find((s) => s.id === activeSceneId) ?? ctx.scenes[0] ?? null;

  // Spec 10e — run the auto-spoglio RegEx once per mount. The server
  // short-circuits on unchanged text_hash, so a second mount is cheap.
  // Only kicks in for editors; viewers skip (mutation requires edit access).
  // The ref is the primary guard against StrictMode's double-invoke; the
  // `isIdle` check is belt-and-braces against rapid remounts firing while
  // a previous mutation is still in flight.
  const autoSpoglio = useRunAutoSpoglio(projectId, versionId);
  const autoSpoglioStartedRef = useRef(false);
  useEffect(() => {
    if (!canEdit) return;
    if (versionId.length === 0) return;
    if (autoSpoglioStartedRef.current) return;
    if (!autoSpoglio.isIdle) return;
    autoSpoglioStartedRef.current = true;
    autoSpoglio.mutate();
  }, [autoSpoglio, canEdit, versionId]);

  const scriptReaderRef = useRef<ScriptReaderHandle>(null);

  const { data: projectRows } = useQuery(
    projectBreakdownOptions(projectId, versionId),
  );

  const elements: ElementForMatch[] = (projectRows ?? []).map((row) => ({
    id: row.element.id,
    name: row.element.name,
    category: row.element.category,
    isStale: row.hasStale,
  }));

  const { data: sceneData } = useQuery(
    breakdownForSceneOptions(activeScene?.id ?? "", versionId),
  );

  const suggestions: CesareSuggestionLite[] = (sceneData ?? [])
    .filter((d) => d.occurrence.cesareStatus === "pending")
    .map((d) => ({
      category: d.element.category,
      name: d.element.name,
      occurrenceId: d.occurrence.id,
    }));

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

      {autoSpoglio.isPending && (
        <div
          className={styles.autoSpoglioBanner}
          role="status"
          data-testid="auto-spoglio-banner"
        >
          Auto-spoglio in corso… ({ctx.scenes.length}{" "}
          {ctx.scenes.length === 1 ? "scena" : "scene"})
        </div>
      )}

      {activeTab === "per-scene" ? (
        <div className={styles.split}>
          <aside className={styles.toc} data-testid="breakdown-toc">
            <SceneTOC
              scenes={ctx.scenes}
              versionId={versionId}
              activeSceneId={activeScene?.id ?? null}
              onSceneSelect={(sceneId) => {
                setActiveSceneId(sceneId);
                const idx = ctx.scenes.findIndex((s) => s.id === sceneId);
                if (idx >= 0) scriptReaderRef.current?.scrollToScene(idx + 1);
              }}
            />
          </aside>
          <section className={styles.script} data-testid="breakdown-script">
            <ScriptReader
              ref={scriptReaderRef}
              projectId={projectId}
              versionId={versionId}
              versionContent={ctx.versionContent}
              scenes={ctx.scenes}
              elements={elements}
              suggestions={suggestions}
              canEdit={canEdit}
              activeSceneId={activeScene?.id ?? null}
              onActiveSceneChange={setActiveSceneId}
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
