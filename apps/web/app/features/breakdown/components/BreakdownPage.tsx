import { useEffect, useRef, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Tabs, StreamingProgressBanner } from "@oh-writers/ui";
import { Suspense } from "react";
import {
  breakdownContextOptions,
  breakdownForSceneOptions,
  projectBreakdownOptions,
  useRunAutoSpoglio,
  useStreamFullSpoglio,
  useSpoglioProgress,
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
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const aiMenuWrapRef = useRef<HTMLDivElement>(null);

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

  // Spec 10g — fire the Sonnet full-script breakdown alongside the regex
  // baseline. The server early-returns when the env-var feature flag is
  // off, so calling unconditionally is cheap. The polling progress query
  // drives the streaming banner.
  const llmSpoglio = useStreamFullSpoglio(versionId);
  const llmSpoglioStartedRef = useRef(false);
  useEffect(() => {
    if (!canEdit) return;
    if (versionId.length === 0) return;
    if (llmSpoglioStartedRef.current) return;
    if (!llmSpoglio.isIdle) return;
    llmSpoglioStartedRef.current = true;
    llmSpoglio.mutate();
  }, [llmSpoglio, canEdit, versionId]);

  const { data: progress } = useSpoglioProgress(versionId);
  const showLlmBanner =
    progress !== undefined &&
    progress.scenesTotal !== null &&
    progress.scenesTotal > 0 &&
    !progress.isComplete;

  // Close the AI re-spoglio menu on outside click.
  useEffect(() => {
    if (!aiMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = aiMenuWrapRef.current;
      if (node && !node.contains(event.target as Node)) {
        setAiMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [aiMenuOpen]);

  const handleFullRespoglio = () => {
    setAiMenuOpen(false);
    // Estimated cost is shown so editors don't accidentally trigger a paid run
    // on a long script. ~$0.08 is the spec-10g Sonnet 4 estimate.
    const ok = window.confirm(
      "Avviare lo spoglio AI dell'intera versione? Costo stimato: ~$0.08, durata ~45s.",
    );
    if (!ok) return;
    llmSpoglioStartedRef.current = true;
    llmSpoglio.mutate();
  };

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
          <div className={styles.headerActions}>
            <div className={styles.aiRespoglioWrap} ref={aiMenuWrapRef}>
              <button
                type="button"
                className={styles.aiRespoglioTrigger}
                data-testid="ai-respoglio-trigger"
                aria-haspopup="menu"
                aria-expanded={aiMenuOpen}
                disabled={llmSpoglio.isPending || showLlmBanner}
                onClick={() => setAiMenuOpen((open) => !open)}
              >
                Ri-spogliare con AI ▾
              </button>
              {aiMenuOpen && (
                <div
                  role="menu"
                  className={styles.aiRespoglioMenu}
                  data-testid="ai-respoglio-menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.aiRespoglioMenuItem}
                    data-testid="ai-respoglio-full"
                    onClick={handleFullRespoglio}
                  >
                    <span className={styles.aiRespoglioMenuItemLabel}>
                      Ri-spogliare l&apos;intera versione
                    </span>
                    <span className={styles.aiRespoglioMenuItemHint}>
                      Sonnet · ~$0.08 · ~45s
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.exportTrigger}
              data-testid="breakdown-export-trigger"
              onClick={() => setExportOpen(true)}
            >
              Export
            </button>
          </div>
        )}
      </header>

      <VersionImportBanner projectId={projectId} versionId={versionId} />

      {showLlmBanner && progress && (
        <div className={styles.llmBannerWrap}>
          <StreamingProgressBanner
            data-testid="llm-spoglio-banner"
            done={progress.scenesDone}
            total={progress.scenesTotal}
            message="Spoglio AI in corso"
            progressLabel="Avanzamento spoglio AI"
          />
        </div>
      )}

      {autoSpoglio.isPending && !showLlmBanner && (
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
