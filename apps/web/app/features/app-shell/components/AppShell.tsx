import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { TopBar, SkipLink, CommandPalette } from "@oh-writers/ui";
import type {
  SaveState,
  TopBarSection,
  TopBarSectionGroup,
  CommandPaletteItem,
  ProjectSwitcherItem,
} from "@oh-writers/ui";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import type { AppUser } from "~/server/context";
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
  children: ReactNode;
}

const deriveInitials = (name: string): string =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export function AppShell({
  user,
  projectName = "",
  sectionName = "",
  saveState = "saved",
  saveSecondsAgo,
  cesareNoteCount = 0,
  sections,
  sectionGroups,
  projects,
  currentProjectId,
  onProjectSelect,
  children,
}: AppShellProps) {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isPaletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;

    const onScroll = () => setIsScrolled(main.scrollTop > 0);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

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
        onSelect: () => console.log("[palette] nav:dashboard"),
      },
      {
        id: "nav:screenplay",
        label: "Apri sceneggiatura",
        group: "Navigazione",
        icon: "file-text",
        keywords: ["script", "fountain", "editor"],
        onSelect: () => console.log("[palette] nav:screenplay"),
      },
      {
        id: "nav:locations",
        label: "Apri sopralluoghi",
        group: "Navigazione",
        icon: "map-pin",
        keywords: ["location", "scouting"],
        onSelect: () => console.log("[palette] nav:locations"),
      },
      {
        id: "act:new-scene",
        label: "Nuova scena",
        group: "Azioni",
        icon: "plus",
        keywords: ["aggiungi", "create"],
        onSelect: () => console.log("[palette] act:new-scene"),
      },
      {
        id: "act:ask-cesare",
        label: "Chiedi a Cesare",
        group: "Azioni",
        icon: "comment",
        keywords: ["ai", "assistente", "rifinitura"],
        onSelect: () => console.log("[palette] act:ask-cesare"),
      },
      {
        id: "act:export-pdf",
        label: "Esporta in PDF",
        group: "Azioni",
        icon: "download",
        keywords: ["export", "stampa", "scarica"],
        onSelect: () => console.log("[palette] act:export-pdf"),
      },
      {
        id: "scene:goto",
        label: "Vai alla scena…",
        group: "Scena",
        icon: "search",
        keywords: ["jump", "salta"],
        onSelect: () => console.log("[palette] scene:goto"),
      },
      {
        id: "scene:pin",
        label: "Pinna scena corrente",
        group: "Scena",
        icon: "pin",
        keywords: ["fissa", "preferita"],
        onSelect: () => console.log("[palette] scene:pin"),
      },
      {
        id: "scene:comment",
        label: "Commenta scena corrente",
        group: "Scena",
        icon: "comment",
        keywords: ["nota", "feedback"],
        onSelect: () => console.log("[palette] scene:comment"),
      },
    ],
    [],
  );

  return (
    <VersionsDrawerProvider>
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
      </div>
    </VersionsDrawerProvider>
  );
}
