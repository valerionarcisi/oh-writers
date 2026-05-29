import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActionsMenu,
  Icon,
  Popover,
  VersionTrigger,
  Viewbar,
  ViewbarSep,
} from "@oh-writers/ui";
import type { DropdownMenuItem } from "@oh-writers/ui";
import { DraftMetaBadge } from "~/features/projects";
import {
  SaveStatusIndicator,
  useTopBarSlotPublisher,
} from "~/features/app-shell";
import styles from "./ScreenplayEditorShell.module.css";

// ─── Editor shell ──────────────────────────────────────────────────────────
// Pure layout around the screenplay editor. Mirrors the Breakdown V2 ambient
// shape: sticky Viewbar (centered chips + right Indice/version), a thin
// sceneBar with eyebrow + stats, and a 1fr / 280px grid below. The editor
// itself slots into the center column as a flat white surface — no black
// canvas, no big "chapter" header.
//
// Export + Focus + ... live in the TopBar first row (actions slot, right of
// search). Chips + Indice live in the Viewbar second row below the TopBar.

type SceneEntry = {
  number: string;
  title: string;
  isCurrent?: boolean;
};

type ActEntry = {
  name: string;
  scenes: SceneEntry[];
};

const FALLBACK_ACTS: ActEntry[] = [
  { name: "Atto I", scenes: [{ number: "1.", title: "—", isCurrent: true }] },
];

export type ScreenplayEditorShellProps = {
  title: string;
  /** Project id — drives the DraftMetaBadge in the viewbar right. */
  projectId: string;
  /** The Monaco/ProseMirror editor — rendered untouched in the center column */
  children: ReactNode;
  /** Optional override for the TOC content; falls back to a single-scene stub */
  acts?: ActEntry[];
  /** @deprecated Slot rendered centered in the Viewbar (legacy path). */
  viewbarCenter?: ReactNode;
  /** Opens the Versions drawer. When provided, a `VersionTrigger` pill is
   *  rendered in the Viewbar right slot. */
  onOpenVersions?: () => void;
  /** Optional label shown inside the version pill (e.g. "v3 · 14 mag 2026"). */
  versionLabel?: string;
  /** Optional list of versions to surface in the version-trigger dropdown.
   *  When provided, the menu shows the version history + the "Apri Versioni"
   *  action. When empty, only the "Apri" action is shown. */
  versions?: ReadonlyArray<{ id: string; label: string; isCurrent: boolean }>;
  /** Optional Cesare panel rendered in the right margin column. When provided
   *  a ✦ toggle button appears in the Viewbar right. */
  cesarePanel?: ReactNode;
  /** Whether the Cesare panel is expanded. Controlled by parent. */
  isCesarePanelOpen?: boolean;
  /** Called when the user clicks the ✦ toggle button. */
  onToggleCesarePanel?: () => void;
  /** Called when the user activates the "Esporta PDF" TopBar action. */
  onExport?: () => void;
  /** True while the PDF export is in progress — disables the export button. */
  isExporting?: boolean;
  /** Called when the user activates the Focus toggle in the TopBar. */
  onFocusToggle?: () => void;
  /** Whether focus mode is currently active — used to label the button. */
  isFocusMode?: boolean;
};

export function ScreenplayEditorShell({
  title: _title,
  projectId,
  children,
  acts,
  viewbarCenter,
  onOpenVersions,
  versionLabel,
  versions,
  cesarePanel,
  isCesarePanelOpen = false,
  onToggleCesarePanel,
  onExport,
  isExporting = false,
  onFocusToggle,
  isFocusMode = false,
}: ScreenplayEditorShellProps) {
  const [isIndiceOpen, setIndiceOpen] = useState(false);
  const [indiceQuery, setIndiceQuery] = useState("");
  const [isScrolled, setScrolled] = useState(false);
  const viewbarWrapRef = useRef<HTMLDivElement>(null);

  // Toggle the data-scrolled flag on the viewbar so its CSS can shrink the
  // chip strip once the user has moved past the top of the page. The actual
  // scrolling happens on either AppShell's #main-content (when it has
  // overflow:auto and is shorter than its content) or the window itself
  // (when main expands to fit). Listen on both to cover both cases.
  useEffect(() => {
    const main = document.getElementById("main-content");
    const onScroll = () => {
      const top = (main?.scrollTop ?? 0) + window.scrollY;
      setScrolled(top > 4);
    };
    onScroll();
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const tocActs = useMemo(() => acts ?? FALLBACK_ACTS, [acts]);
  const hasRealToc = acts !== undefined && acts.length > 0;
  void _title; // currently unused — kept for future TOC-driven indices

  const { currentSceneIdx, totalScenes } = useMemo(() => {
    let total = 0;
    let current = 1;
    tocActs.forEach((act) => {
      act.scenes.forEach((scene) => {
        total += 1;
        if (scene.isCurrent) current = total;
      });
    });
    return { currentSceneIdx: current, totalScenes: total };
  }, [tocActs]);

  // Assign a 0-based DOM index to every scene (matches `.pm-heading` NodeList
  // order) so the onClick handler can scroll to the right heading regardless
  // of act grouping or search filtering.
  const actsWithDomIndex = useMemo(() => {
    let globalIdx = 0;
    return tocActs.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene) => ({
        ...scene,
        domIndex: globalIdx++,
      })),
    }));
  }, [tocActs]);

  const filteredActs = useMemo(() => {
    const q = indiceQuery.trim().toLowerCase();
    if (!q) return actsWithDomIndex;
    return actsWithDomIndex
      .map((act) => ({
        ...act,
        scenes: act.scenes.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.number.toLowerCase().includes(q),
        ),
      }))
      .filter((act) => act.scenes.length > 0);
  }, [actsWithDomIndex, indiceQuery]);

  // Publish the unified "…" actions menu into the TopBar actions slot (first
  // row, right of the search lens). Esporta PDF + Focus + Versioni live here;
  // the Indice + chips stay in the Viewbar second row. Only published when at
  // least one action is wired.
  const topBarActionsNode = useMemo(() => {
    if (!onExport && !onFocusToggle && !onOpenVersions) return null;
    const items: DropdownMenuItem[] = [];
    if (onExport) {
      items.push({
        label: isExporting ? "Esportazione…" : "Esporta PDF",
        description: "⌘E",
        onClick: onExport,
        disabled: isExporting,
      });
    }
    if (onFocusToggle) {
      items.push({
        label: isFocusMode ? "Esci da Focus" : "Focus",
        description: "⌃⌥F",
        onClick: onFocusToggle,
      });
    }
    if (onOpenVersions) {
      items.push({ label: "Versioni", onClick: onOpenVersions });
    }
    return <ActionsMenu data-testid="screenplay-actions-menu" items={items} />;
  }, [onExport, isExporting, onFocusToggle, isFocusMode, onOpenVersions]);
  useTopBarSlotPublisher("actions", topBarActionsNode);

  function scrollToScene(domIndex: number) {
    const headings = document.querySelectorAll<HTMLElement>(".pm-heading");
    headings[domIndex]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setIndiceOpen(false);
  }

  // The Viewbar right slot: SaveStatus + Indice + DraftBadge + Versions.
  const viewbarRightNode = (
    <div className={styles.viewbarRight}>
      <SaveStatusIndicator />
      {hasRealToc && (
        <div className={styles.indiceWrap}>
          <button
            type="button"
            className={styles.indiceButton}
            onClick={() => setIndiceOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={isIndiceOpen}
            aria-label="Apri indice scene"
            data-testid="screenplay-indice-trigger"
          >
            <Icon name="book" size={14} aria-hidden />
            <span>Indice</span>
            <span className={styles.indiceBadge} data-num>
              {currentSceneIdx}/{totalScenes}
            </span>
            <span className={styles.indiceCaret} aria-hidden>
              ▾
            </span>
          </button>
          <Popover
            isOpen={isIndiceOpen}
            onClose={() => setIndiceOpen(false)}
            placement="bottom-end"
            width={320}
            className={styles.indicePopover}
          >
            <div className={styles.popSearch}>
              <Icon name="search" size={14} aria-hidden />
              <input
                type="text"
                value={indiceQuery}
                onChange={(e) => setIndiceQuery(e.target.value)}
                placeholder="Cerca scena o luogo…"
                aria-label="Cerca scena o luogo"
                className={styles.popSearchInput}
                autoFocus
              />
              <kbd className={styles.popKbd}>⌘K</kbd>
            </div>
            <div className={styles.popList}>
              {filteredActs.length === 0 ? (
                <p className={styles.popEmpty}>Nessuna scena trovata</p>
              ) : (
                filteredActs.map((act) => (
                  <div key={act.name}>
                    <p className={styles.popAct}>{act.name}</p>
                    {act.scenes.map((scene) => (
                      <button
                        type="button"
                        key={`${act.name}-${scene.number}`}
                        className={[
                          styles.popItem,
                          scene.isCurrent ? styles.popItemCurrent : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-current={scene.isCurrent ? "true" : undefined}
                        onClick={() => scrollToScene(scene.domIndex)}
                      >
                        <span className={styles.popItemNum}>
                          SC.{scene.number.replace(".", "")}
                        </span>
                        <span className={styles.popItemLabel}>
                          {scene.title}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </Popover>
        </div>
      )}
      <DraftMetaBadge projectId={projectId} />
      {onOpenVersions && (
        <VersionTrigger
          variant="pill"
          versionLabel={versionLabel}
          menuItems={[
            ...(versions && versions.length > 0
              ? versions.map((v) => ({
                  id: `version-${v.id}`,
                  label: v.isCurrent ? `● ${v.label}` : v.label,
                  onSelect: onOpenVersions,
                  tone: v.isCurrent
                    ? ("default" as const)
                    : ("muted" as const),
                }))
              : []),
            {
              id: "open-drawer",
              label: "Apri Versioni →",
              onSelect: onOpenVersions,
            },
          ]}
        />
      )}
      {onToggleCesarePanel && (
        <>
          <ViewbarSep />
          <button
            type="button"
            className={[
              styles.cesareToggle,
              isCesarePanelOpen ? styles.cesareToggleActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onToggleCesarePanel}
            aria-label={isCesarePanelOpen ? "Chiudi Cesare" : "Apri Cesare"}
            title={isCesarePanelOpen ? "Chiudi Cesare" : "Apri Cesare ✦"}
          >
            ✦
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className={styles.shell}>
      <div
        ref={viewbarWrapRef}
        className={styles.viewbarWrap}
        data-scrolled={isScrolled || undefined}
      >
        <Viewbar>
          <div className={styles.viewbarGrid}>
            <div className={styles.viewbarCenter}>
              {viewbarCenter ?? null}
            </div>
            {viewbarRightNode}
          </div>
        </Viewbar>
      </div>

      <div
        className={
          isCesarePanelOpen && cesarePanel
            ? styles.layoutWithPanel
            : styles.layoutNoMargin
        }
      >
        <div className={styles.editorial}>
          <div className={styles.editorSlot}>{children}</div>
        </div>
        {isCesarePanelOpen && cesarePanel && (
          <aside className={styles.cesarePanelColumn}>{cesarePanel}</aside>
        )}
      </div>
    </div>
  );
}
