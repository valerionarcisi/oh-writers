import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { TopBar, SkipLink, CommandPalette, useToast } from "@oh-writers/ui";
import type {
  SaveState,
  TopBarSection,
  TopBarSectionGroup,
  CommandPaletteItem,
  ProjectSwitcherItem,
  DropdownMenuItem,
} from "@oh-writers/ui";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import { CesareSheet } from "~/features/predictions";
import { askCesare } from "~/features/predictions";
import type { CesarePage } from "~/features/predictions";
import type { AppUser } from "~/server/context";
import { SaveStateProvider, useSaveStateValue } from "../save-state-context";
import { CesareProvider, type OpenCesareOptions } from "../cesare-context";
import {
  ActiveSceneProvider,
  useActiveScene,
  useActiveRequirementId,
  useActiveDocument,
  useActiveShootingDay,
} from "../active-scene-context";
import styles from "./AppShell.module.css";

interface AppShellProps {
  user: AppUser;
  projectName?: string;
  sectionName?: string;
  saveState?: SaveState;
  saveSecondsAgo?: number;
  cesareNoteCount?: number;
  sections?: ReadonlyArray<TopBarSection>;
  sectionGroups?: ReadonlyArray<TopBarSectionGroup>;
  projects?: ReadonlyArray<ProjectSwitcherItem>;
  currentProjectId?: string;
  onProjectSelect?: (id: string) => void;
  userMenuItems?: DropdownMenuItem[];
  projectId?: string;
  cesarePage?: CesarePage;
  children: ReactNode;
}

const deriveInitials = (name: string): string =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export function AppShell(props: AppShellProps) {
  return (
    <SaveStateProvider>
      <ActiveSceneProvider>
        <AppShellInner {...props} />
      </ActiveSceneProvider>
    </SaveStateProvider>
  );
}

function AppShellInner({
  user,
  projectName = "",
  sectionName = "",
  saveState: saveStateProp,
  saveSecondsAgo: saveSecondsAgoProp,
  cesareNoteCount = 0,
  sections,
  sectionGroups,
  projects,
  currentProjectId,
  onProjectSelect,
  userMenuItems,
  projectId,
  cesarePage,
  children,
}: AppShellProps) {
  const ctxSave = useSaveStateValue();
  const saveState = ctxSave.state ?? saveStateProp;
  const saveSecondsAgo = ctxSave.secondsAgo ?? saveSecondsAgoProp;
  const activeScene = useActiveScene();
  const activeRequirementId = useActiveRequirementId();
  const activeDocument = useActiveDocument();
  const activeShootingDay = useActiveShootingDay();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [cesareOpen, setCesareOpen] = useState(false);
  const [cesareRequirementId, setCesareRequirementId] = useState<string | null>(null);

  const handleCesareAssistantResponse = useCallback((reply: string) => {
    if (cesarePage === "locations" && projectId) {
      void queryClient.invalidateQueries({ queryKey: ["locations", projectId] });
      // Show a toast when Cesare adds candidates or performs a scouting action
      const lc = reply.toLowerCase();
      if (lc.includes("aggiunto") || lc.includes("candidato") || lc.includes("trovato")) {
        showToast({
          message: "✦ Cesare ha aggiornato le location",
          variant: "success",
        });
      }
      return;
    }

    // Document pages — Cesare may have applied an edit via tools. Invalidate
    // the active document query so the editor refetches the new content, and
    // surface a toast when the reply hints at a successful tool call.
    const isDocPage =
      cesarePage === "soggetto" ||
      cesarePage === "synopsis" ||
      cesarePage === "outline" ||
      cesarePage === "treatment";
    if (isDocPage && projectId && activeDocument) {
      void queryClient.invalidateQueries({
        queryKey: ["documents", projectId, activeDocument.type],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", activeDocument.id],
      });
      const lc = reply.toLowerCase();
      if (
        lc.includes("aggiornato") ||
        lc.includes("espanso") ||
        lc.includes("compresso") ||
        lc.includes("riscritto") ||
        lc.includes("modificato") ||
        lc.includes("sostituito")
      ) {
        const labels: Record<string, string> = {
          soggetto: "il soggetto",
          synopsis: "la sinossi",
          outline: "la scaletta",
          treatment: "il trattamento",
        };
        showToast({
          message: `✦ Cesare ha aggiornato ${labels[cesarePage] ?? "il documento"}`,
          variant: "success",
        });
      }
    }

    // Budget page — Cesare acts as a Line Producer via budget tools.
    if (cesarePage === "budget" && projectId) {
      void queryClient.invalidateQueries({ queryKey: ["budget", projectId] });
      const lc = reply.toLowerCase();
      if (
        lc.includes("aggiornato") ||
        lc.includes("aggiunto") ||
        lc.includes("ridistribuito") ||
        lc.includes("modificato") ||
        lc.includes("spostato")
      ) {
        showToast({
          message: "✦ Cesare ha aggiornato il budget",
          variant: "success",
        });
      }
    }
  }, [cesarePage, projectId, queryClient, showToast, activeDocument]);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;

    const onScroll = () => setIsScrolled(main.scrollTop > 0);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openCesare = useCallback((opts?: OpenCesareOptions) => {
    setCesareRequirementId(opts?.requirementId ?? null);
    setCesareOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleBrandClick = () => {
    void router.navigate({ to: "/dashboard" });
  };

  const handleNavigate = (href: string) => {
    void router.navigate({ to: href });
  };

  const handleProjectSelect = (id: string) => {
    if (onProjectSelect) {
      onProjectSelect(id);
      return;
    }
    void router.navigate({ to: "/projects/$id", params: { id } });
  };

  const handleAllProjects = () => {
    void router.navigate({ to: "/dashboard" });
  };

  const paletteItems = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: "nav:dashboard",
        label: "Vai alla Dashboard",
        group: "Navigazione",
        icon: "compass",
        keywords: ["home", "progetti", "start"],
        onSelect: () => void router.navigate({ to: "/dashboard" }),
      },
    ],
    [router],
  );

  return (
    <VersionsDrawerProvider>
      <CesareProvider openCesare={openCesare}>
        <div className={styles.shell}>
          <SkipLink targetId="main-content" />
          <TopBar
            projectName={projectName}
            sectionName={sectionName}
            saveState={saveState}
            saveSecondsAgo={saveSecondsAgo}
            cesareNoteCount={cesareNoteCount}
            userInitials={deriveInitials(user.name)}
            presenceUsers={[]}
            isScrolled={isScrolled}
            sections={sections}
            sectionGroups={sectionGroups}
            projects={projects}
            currentProjectId={currentProjectId}
            onProjectSelect={handleProjectSelect}
            onAllProjects={handleAllProjects}
            onNavigate={handleNavigate}
            onBrandClick={handleBrandClick}
            onProjectClick={handleBrandClick}
            onSectionClick={undefined}
            onSearch={openPalette}
            onBell={undefined}
            onAskCesare={undefined}
            onAvatarClick={undefined}
            userMenuItems={userMenuItems}
          />
          <main id="main-content" className={styles.main}>
            {children}
          </main>
          <VersionsDrawer />
          <CommandPalette
            isOpen={isPaletteOpen}
            onClose={closePalette}
            items={paletteItems}
          />
          {projectId && (
            <CesareSheet
              projectId={projectId}
              page={cesarePage ?? "screenplay"}
              sceneId={activeScene?.sceneId ?? null}
              sceneNumber={activeScene?.sceneNumber ?? null}
              requirementId={cesareRequirementId ?? activeRequirementId}
              documentId={activeDocument?.id ?? null}
              shootingDayId={activeShootingDay?.dayId ?? null}
              shootingDayNumber={activeShootingDay?.dayNumber ?? null}
              isOpen={cesareOpen}
              onClose={() => setCesareOpen(false)}
              onOpenFullPage={() => {
                setCesareOpen(false);
                // TODO: navigate to full Cesare page (future)
              }}
              askCesare={askCesare}
              onAssistantResponse={handleCesareAssistantResponse}
            />
          )}
        </div>
      </CesareProvider>
    </VersionsDrawerProvider>
  );
}
