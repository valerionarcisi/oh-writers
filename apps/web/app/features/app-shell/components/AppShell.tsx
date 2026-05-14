import { type ReactNode, useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { TopBar, SkipLink } from "@oh-writers/ui";
import type {
  SaveState,
  TopBarSection,
  TopBarSectionGroup,
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
  children,
}: AppShellProps) {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;

    const onScroll = () => setIsScrolled(main.scrollTop > 0);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const handleBrandClick = () => {
    void router.navigate({ to: "/dashboard" });
  };

  const handleNavigate = (href: string) => {
    void router.navigate({ to: href });
  };

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
          onNavigate={handleNavigate}
          onBrandClick={handleBrandClick}
          onProjectClick={handleBrandClick}
          onSectionClick={undefined}
          onSearch={undefined}
          onBell={undefined}
          onAskCesare={undefined}
          onAvatarClick={undefined}
        />
        <main id="main-content" className={styles.main}>
          {children}
        </main>
        <VersionsDrawer />
      </div>
    </VersionsDrawerProvider>
  );
}
