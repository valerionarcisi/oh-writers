import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { TopBar, SkipLink, CommandPalette } from "@oh-writers/ui";
import type {
  SaveState,
  TopBarSection,
  TopBarSectionGroup,
  CommandPaletteItem,
  ProjectSwitcherItem,
  DropdownMenuItem,
} from "@oh-writers/ui";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import type { AppUser } from "~/server/context";
import { SaveStateProvider, useSaveStateValue } from "../save-state-context";
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
      <AppShellInner {...props} />
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
  children,
}: AppShellProps) {
  const ctxSave = useSaveStateValue();
  const saveState = ctxSave.state ?? saveStateProp;
  const saveSecondsAgo = ctxSave.secondsAgo ?? saveSecondsAgoProp;
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
        onSelect: () => void router.navigate({ to: "/dashboard" }),
      },
    ],
    [router],
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
      </div>
    </VersionsDrawerProvider>
  );
}
